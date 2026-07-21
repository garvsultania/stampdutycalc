import "server-only";
import { NextResponse } from "next/server";
import { inputContractActiveOn, type RuleInputContract } from "@stampdraft/schema";
import type { Store } from "@stampdraft/store";
import { getCorpus } from "./rules-server";
import { Tier2LifecycleError, Tier2LifecycleService } from "./tier2-lifecycle";
import { getTier2Provider } from "./tier2-provider";

export function tier2Service(store: Store): Tier2LifecycleService {
  const provider = getTier2Provider();
  if (!provider) {
    throw new Tier2LifecycleError("provider_unavailable", "document extraction is unavailable", 503);
  }
  return new Tier2LifecycleService(store, provider, { allowTestProvider: process.env.NODE_ENV === "test" });
}

export function findInputContract(
  jurisdiction: string,
  ruleId: string,
  executionDate: string,
): RuleInputContract {
  const { corpus } = getCorpus();
  const rule = corpus.ruleSet.rules.find((candidate) =>
    candidate.jurisdiction === jurisdiction &&
    candidate.rule_id === ruleId &&
    candidate.input_contract !== undefined &&
    inputContractActiveOn(candidate.input_contract, executionDate),
  );
  if (!rule?.input_contract) {
    throw new Tier2LifecycleError("invalid_request", "no active extraction contract matches this rule", 400);
  }
  return rule.input_contract;
}

export async function contractForJob(store: Store, firmId: string, id: string): Promise<RuleInputContract> {
  const job = await store.getExtractionJob(firmId, id);
  if (!job) throw new Tier2LifecycleError("not_found", "extraction job not found", 404);
  return findInputContract(job.jurisdiction, job.rule_id, job.execution_date);
}

export function tier2ErrorResponse(error: unknown): NextResponse {
  if (error instanceof Tier2LifecycleError) {
    return noStore({ ok: false, error: error.publicMessage, code: error.code }, error.status);
  }
  return noStore({ ok: false, error: "extraction request could not be completed" }, 500);
}

export function noStore(body: Record<string, unknown>, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
