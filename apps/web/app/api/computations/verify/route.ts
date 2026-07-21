import { NextRequest, NextResponse } from "next/server";
import { canonicalJson, computeFromSnapshotArchive } from "@stampdraft/engine";
import { internalErrorResponse, resolveWorkspace } from "@/lib/api-workspace";
import { executionPolicyForRequest } from "@/lib/execution-policy";

export const dynamic = "force-dynamic";

/**
 * Replay an audit record from its hash-addressed archived snapshot. Live rules
 * are deliberately absent from this path: later corpus changes cannot alter the
 * law an earlier computation relied upon.
 */
export async function POST(req: NextRequest) {
  const resolved = await resolveWorkspace(req);
  if (!resolved.ok) return resolved.response;
  const { store, firmId } = resolved.workspace;
  let recordId: unknown;
  let rec: Awaited<ReturnType<typeof store.getComputation>>;
  try {
    ({ recordId } = await req.json() as { recordId?: unknown });
    if (typeof recordId !== "string") {
      return NextResponse.json({ ok: false, error: "record not found" }, { status: 404 });
    }
    rec = await store.getComputation(firmId, recordId);
  } catch {
    return internalErrorResponse("could not verify computation");
  }
  if (!rec) return NextResponse.json({ ok: false, error: "record not found" }, { status: 404 });

  let snapshotArchive;
  try {
    snapshotArchive = await store.getSnapshotArchive(rec.rules_version);
  } catch {
    return replayRefusal(rec, "Archived snapshot could not be validated.");
  }
  if (!snapshotArchive) {
    return replayRefusal(rec, `Archived snapshot ${rec.rules_version} is missing.`);
  }

  try {
    const replay = computeFromSnapshotArchive(snapshotArchive.payload, rec.rules_version, {
      jurisdiction: rec.jurisdiction as "DL" | "MH" | "KA",
      rule_id: rec.rule_id,
      execution_date: rec.execution_date,
      values: rec.input_values as Record<string, string>,
      facts: rec.input_facts as Record<string, string>,
      ...(rec.duty_paid ? { duty_paid: rec.duty_paid } : {}),
    }, {
      penaltyMonths: rec.penalty_months ?? undefined,
      ...executionPolicyForRequest(req),
    });

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
      note: identical
        ? "Reproduced exactly from the retained inputs and hash-verified archived snapshot."
        : "The archived snapshot hash is valid but the replayed output differs — investigate immediately.",
    });
  } catch {
    return replayRefusal(rec, "Archived replay was safely refused.");
  }
}

function replayRefusal(
  rec: { total_duty: string; rules_version: string },
  note: string,
): NextResponse {
  return NextResponse.json({
    ok: false,
    refused: true,
    verified: false,
    sameHash: false,
    sameTotal: false,
    recorded: { total: rec.total_duty, hash: rec.rules_version },
    replayed: null,
    note,
  }, { status: 409 });
}
