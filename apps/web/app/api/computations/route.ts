import { NextRequest, NextResponse } from "next/server";
import { compute, EngineError } from "@stampdraft/engine";
import { getCorpus } from "@/lib/rules-server";
import { DEMO_USER, ENGINE_VERSION } from "@/lib/store-server";
import { resolveWorkspace } from "@/lib/api-workspace";
import { indiaTodayISO } from "@/lib/legal-date";

export const dynamic = "force-dynamic";

/** Compute AND record to the immutable audit log, in one step. */
export async function POST(req: NextRequest) {
  try {
    const { input, penaltyMonths, matterId } = await req.json();
    const { corpus } = getCorpus();
    const output = compute(corpus.ruleSet, input, {
      penaltyMonths: penaltyMonths === undefined ? undefined : Number(penaltyMonths),
      requireVerified: process.env.NODE_ENV === "production",
      requireEvidence: process.env.NODE_ENV === "production",
      evidenceAsOf: indiaTodayISO(),
    });

    const resolved = await resolveWorkspace();
    if (!resolved.ok) return resolved.response;
    const { store, firmId } = resolved.workspace;
    const record = await store.recordComputation({
      firmId,
      matterId: matterId ?? null,
      userEmail: DEMO_USER.email,
      output,
      engineVersion: ENGINE_VERSION,
      penaltyMonths: penaltyMonths ?? null,
      // Tier 1: no model touched these fields. M4 will pass the extraction model here.
      extractionModelVersion: null,
    });
    return NextResponse.json({ ok: true, output, recordId: record.id });
  } catch (e) {
    if (e instanceof EngineError) {
      return NextResponse.json({ ok: false, escalation: e.message }, { status: 422 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
