import { NextRequest, NextResponse } from "next/server";
import { canonicalJson, compute } from "@stampdraft/engine";
import { getCorpus } from "@/lib/rules-server";
import { resolveWorkspace } from "@/lib/api-workspace";

export const dynamic = "force-dynamic";

/**
 * Replay an audit record: recompute from ONLY the retained inputs and check the
 * result against what was recorded. This is the PRD §7 reproducibility claim made
 * executable — a lawyer can prove, years later, that the number on the memo is
 * what the encoded law actually produced.
 *
 * A mismatch is meaningful, not a bug: it means the ruleset moved under the record
 * (rules_version differs), which is precisely what a versioned corpus should surface.
 */
export async function POST(req: NextRequest) {
  const { recordId } = await req.json();
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { store, firmId } = resolved.workspace;
  const rec = await store.getComputation(firmId, recordId);
  if (!rec) return NextResponse.json({ ok: false, error: "record not found" }, { status: 404 });

  const { corpus } = getCorpus();
  try {
    const replay = compute(corpus.ruleSet, {
      jurisdiction: rec.jurisdiction as "DL" | "MH" | "KA",
      rule_id: rec.rule_id,
      execution_date: rec.execution_date,
      values: rec.input_values as Record<string, string>,
      facts: rec.input_facts as Record<string, string>,
      ...(rec.duty_paid ? { duty_paid: rec.duty_paid } : {}),
    }, { penaltyMonths: rec.penalty_months ?? undefined });

    const sameHash = replay.rules_version === rec.rules_version;
    const sameTotal = replay.total_duty === rec.total_duty;
    const identical = canonicalJson(replay) === canonicalJson(rec.output);

    return NextResponse.json({
      ok: true,
      verified: sameHash && sameTotal && identical,
      sameHash,
      sameTotal,
      recorded: { total: rec.total_duty, hash: rec.rules_version },
      replayed: { total: replay.total_duty, hash: replay.rules_version },
      note: sameHash
        ? sameTotal
          ? "Reproduced exactly from the retained inputs and ruleset hash."
          : "The ruleset is unchanged but the total differs — investigate immediately."
        : "The ruleset has changed since this computation was recorded, so the law it relied on is no longer the current law. The original record stands as evidence of what was relied upon at the time.",
    });
  } catch (e) {
    return NextResponse.json({
      ok: true, verified: false, sameHash: false, sameTotal: false,
      recorded: { total: rec.total_duty, hash: rec.rules_version },
      replayed: null,
      note: `Replay now escalates under the current ruleset: ${(e as Error).message}`,
    });
  }
}
