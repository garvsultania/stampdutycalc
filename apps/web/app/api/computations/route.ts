import { NextRequest, NextResponse } from "next/server";
import { buildSnapshot, compute, createSnapshotArchive } from "@stampdraft/engine";
import { MatterScopeError } from "@stampdraft/store";
import { getCorpus } from "@/lib/rules-server";
import { ENGINE_VERSION } from "@/lib/store-server";
import { internalErrorResponse, resolveWorkspace } from "@/lib/api-workspace";
import { executionPolicyForRequest } from "@/lib/execution-policy";
import { describeEngineRefusal, isEngineError } from "@/lib/computation-refusal";

export const dynamic = "force-dynamic";

/** Compute AND record to the immutable audit log, in one step. */
export async function POST(req: NextRequest) {
  const resolved = await resolveWorkspace(req);
  if (!resolved.ok) return resolved.response;
  const { store, firmId, principal } = resolved.workspace;
  try {
    const { input, penaltyMonths, matterId } = await req.json();
    const { corpus } = getCorpus();
    const output = compute(corpus.ruleSet, input, {
      penaltyMonths: penaltyMonths === undefined ? undefined : Number(penaltyMonths),
      ...executionPolicyForRequest(req),
    });
    const snapshotArchive = createSnapshotArchive(
      buildSnapshot(corpus.ruleSet, output.jurisdiction as "DL" | "MH" | "KA", output.execution_date),
    );

    const record = await store.recordComputation({
      firmId,
      matterId: matterId ?? null,
      userEmail: principal.userEmail,
      output,
      snapshotArchive,
      engineVersion: ENGINE_VERSION,
      penaltyMonths: penaltyMonths ?? null,
      // Tier 1: no model touched these fields. M4 will pass the extraction model here.
      extractionModelVersion: null,
    });
    return NextResponse.json({ ok: true, output, recordId: record.id });
  } catch (e) {
    if (e instanceof MatterScopeError) {
      return NextResponse.json({ ok: false, error: "matter not found" }, { status: 404 });
    }
    if (isEngineError(e)) {
      return NextResponse.json(
        { ok: false, refusal: describeEngineRefusal(e), escalation: e.message },
        { status: 422 },
      );
    }
    return internalErrorResponse("could not record computation");
  }
}
