import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { EngineErrorCode, RuleSet } from "@stampdraft/engine";
import type { Rule } from "@stampdraft/schema";

const mocks = vi.hoisted(() => ({ ruleSet: undefined as RuleSet | undefined }));

vi.mock("@/lib/rules-server", () => ({
  getCorpus: () => ({ corpus: { ruleSet: mocks.ruleSet } }),
}));
vi.mock("@/lib/execution-policy", () => ({
  executionPolicyForRequest: () => ({ requireVerified: true, requireEvidence: true, evidenceAsOf: "2026-07-21" }),
}));

import { POST } from "./route";

beforeEach(() => {
  mocks.ruleSet = undefined;
});

describe("compute refusal API", () => {
  const cases: Array<[EngineErrorCode, string]> = [
    ["INPUT_REQUIRED", "Review the supplied details"],
    ["LEGAL_REVIEW_REQUIRED", "Legal review required"],
    ["VERIFICATION_REQUIRED", "Founder verification required"],
    ["EVIDENCE_REQUIRED", "Primary-source evidence incomplete"],
    ["ENGINE_REFUSAL", "Computation safely refused"],
  ];

  it.each(cases)("returns a structured %s refusal without removing the legacy escalation", async (code, title) => {
    mocks.ruleSet = ruleSetFor(code);

    const response = await POST(request(code));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.refusal.code, body.refusal.message).toBe(code);
    expect(body).toMatchObject({
      ok: false,
      escalation: expect.any(String),
      refusal: {
        code,
        title,
        message: expect.any(String),
        nextStep: expect.any(String),
        retryable: false,
      },
    });
  });
});

function request(code: EngineErrorCode): NextRequest {
  return new NextRequest("http://localhost:3100/api/compute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: {
        jurisdiction: "DL",
        rule_id: code === "ENGINE_REFUSAL" ? "UNKNOWN" : "R",
        execution_date: "2026-07-21",
        values: {},
        facts: {},
      },
    }),
  });
}

function ruleSetFor(code: EngineErrorCode): RuleSet {
  if (code === "ENGINE_REFUSAL") return { rules: [], modifiers: [], penaltyRegimes: [] };
  const verified = code === "EVIDENCE_REQUIRED";
  const charge: Rule["charge"] = code === "INPUT_REQUIRED"
    ? {
        kind: "ad_valorem",
        base: { lit: "100" },
        pct: { by: "category", cases: [{ when: "known", pct: 1 }] },
      }
    : { kind: "fixed", amount: "100" };
  return {
    rules: [{
      rule_id: "R",
      jurisdiction: "DL",
      act: "Test Act",
      article: "1",
      instrument: "conveyance_sale_deed",
      version: {
        effective_from: "2020-01-01",
        effective_to: null,
        supersedes: null,
        source: { type: "act", ref: "Test Act s.1", quoted_text: "test" },
        verified_by: verified ? "founder" : null,
        verified_on: verified ? "2026-07-20" : null,
      },
      charge,
      modifiers: [],
      rounding: { mode: "none", nearest: 1 },
      pending_verification: code === "LEGAL_REVIEW_REQUIRED" ? [{ reason: "source gap" }] : [],
      notes_for_reviewer: "",
    } as Rule],
    modifiers: [],
    penaltyRegimes: [],
  };
}
