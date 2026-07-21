import { NextRequest } from "next/server";
import { buildSnapshot, compute, createSnapshotArchive } from "@stampdraft/engine";
import { MatterScopeError } from "@stampdraft/store";
import { resolveWorkspace } from "@/lib/api-workspace";
import { contractForJob, noStore, tier2ErrorResponse, tier2Service } from "@/lib/tier2-route";
import { getCorpus } from "@/lib/rules-server";
import { ENGINE_VERSION } from "@/lib/store-server";
import { executionPolicyForRequest } from "@/lib/execution-policy";
import { describeEngineRefusal, isEngineError } from "@/lib/computation-refusal";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const resolved = await resolveWorkspace(req);
  if (!resolved.ok) return resolved.response;
  const { store, firmId, principal } = resolved.workspace;
  try {
    const body = await req.json() as {
      confirmation?: unknown;
      matter_id?: unknown;
      duty_paid?: unknown;
      penalty_months?: unknown;
    };
    const contract = await contractForJob(store, firmId, params.id);
    const extraction = await store.getExtractionJob(firmId, params.id);
    if (!extraction) return noStore({ ok: false, error: "extraction job not found", code: "not_found" }, 404);
    const result = await tier2Service(store).confirm({
      firmId,
      id: params.id,
      contract,
      confirmation: body.confirmation,
      occurredAt: new Date().toISOString(),
      consume: async (confirmed) => {
        const { corpus } = getCorpus();
        const input = {
          jurisdiction: contract.jurisdiction,
          rule_id: contract.rule_id,
          execution_date: extraction.execution_date,
          values: confirmed.values,
          facts: confirmed.facts,
          ...(typeof body.duty_paid === "string" && body.duty_paid.trim()
            ? { duty_paid: body.duty_paid.trim() }
            : {}),
        };
        const penaltyMonths = body.penalty_months === undefined || body.penalty_months === null || body.penalty_months === ""
          ? undefined
          : Number(body.penalty_months);
        const output = compute(corpus.ruleSet, input, {
          penaltyMonths,
          ...executionPolicyForRequest(req),
        });
        const snapshotArchive = createSnapshotArchive(
          buildSnapshot(
            corpus.ruleSet,
            output.jurisdiction as "DL" | "MH" | "KA",
            output.execution_date,
          ),
        );
        const record = await store.recordComputation({
          firmId,
          matterId: typeof body.matter_id === "string" && body.matter_id ? body.matter_id : null,
          userEmail: principal.userEmail,
          output,
          snapshotArchive,
          engineVersion: ENGINE_VERSION,
          penaltyMonths: penaltyMonths ?? null,
          extractionModelVersion: confirmed.extraction_model_version,
          recordId: extraction.id,
        });
        return { output, recordId: record.id };
      },
    });
    return noStore({ ok: true, job: result.job, ...result.consumed });
  } catch (error) {
    if (error instanceof MatterScopeError) {
      return noStore({ ok: false, error: "matter not found" }, 404);
    }
    if (isEngineError(error)) {
      return noStore(
        { ok: false, refusal: describeEngineRefusal(error), escalation: error.message },
        422,
      );
    }
    return tier2ErrorResponse(error);
  }
}
