import { describe, expect, it } from "vitest";
import type { Modifier } from "@stampdraft/schema";
import { assertEvidenceBacked } from "./evidence.js";
import { EngineError, type EngineErrorCode } from "./errors.js";
import { assertFactsPresent, assertNotPending } from "./pending.js";
import { assertFounderVerified } from "./verification.js";

describe("engine refusal codes", () => {
  it("identifies the safe remediation class without parsing diagnostic prose", () => {
    expect(codeOf(() => assertFactsPresent(modifierRequiringFact(), {}))).toBe("INPUT_REQUIRED");
    expect(codeOf(() => assertNotPending({ refuse: ["source gap"], warn: [] }))).toBe(
      "LEGAL_REVIEW_REQUIRED",
    );
    expect(codeOf(() => assertFounderVerified([{ label: "rule R", version: unverifiedVersion() }]))).toBe(
      "VERIFICATION_REQUIRED",
    );
    expect(codeOf(() => assertEvidenceBacked(
      [{ label: "rule R", citation: unverifiedVersion().source }],
      { asOf: "2026-07-21" },
    ))).toBe("EVIDENCE_REQUIRED");
  });
});

function codeOf(run: () => void): EngineErrorCode {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    return (error as EngineError).code;
  }
  throw new Error("expected an EngineError");
}

function unverifiedVersion() {
  return {
    effective_from: "2020-01-01",
    effective_to: null,
    supersedes: null,
    source: { type: "act" as const, ref: "Test Act s.1", quoted_text: "test" },
    verified_by: null,
    verified_on: null,
  };
}

function modifierRequiringFact(): Modifier {
  return {
    modifier_id: "M-1",
    jurisdiction: "DL",
    kind: "surcharge_cess",
    applies_when: { always: true },
    effect: { op: "flat_add", amount: 10, label: "test" },
    order: 1,
    version: unverifiedVersion(),
    requires_facts: ["location"],
    pending_verification: [],
    notes_for_reviewer: "",
  } as Modifier;
}
