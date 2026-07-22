import { describe, expect, it } from "vitest";
import { EngineError, type EngineErrorCode } from "@stampdraft/engine";
import { describeEngineRefusal, isEngineError, unavailableRefusal } from "./computation-refusal.js";

describe("computation refusal presentation", () => {
  const cases: Array<[EngineErrorCode, string]> = [
    ["INPUT_REQUIRED", "Review the supplied details"],
    ["LEGAL_REVIEW_REQUIRED", "Legal review required"],
    ["VERIFICATION_REQUIRED", "Founder verification required"],
    ["EVIDENCE_REQUIRED", "Primary-source evidence incomplete"],
    ["ENGINE_REFUSAL", "Computation safely refused"],
  ];

  it.each(cases)("maps %s to stable actionable copy", (code, title) => {
    const refusal = describeEngineRefusal(new EngineError("diagnostic detail", code));
    expect(refusal).toMatchObject({ code, title, message: "diagnostic detail", retryable: false });
    expect(refusal.nextStep.length).toBeGreaterThan(20);
  });

  it("does not imply that an unavailable service produced a result", () => {
    expect(unavailableRefusal()).toMatchObject({
      code: "ENGINE_REFUSAL",
      title: "Computation service unavailable",
      message: expect.stringContaining("No figure was produced"),
      retryable: true,
    });
  });

  it("recognizes typed refusals across bundled class identities but rejects lookalikes", () => {
    expect(isEngineError({
      name: "EngineError",
      message: "blocked",
      code: "LEGAL_REVIEW_REQUIRED",
    })).toBe(true);
    expect(isEngineError({ name: "EngineError", message: "blocked", code: "UNKNOWN" })).toBe(false);
    expect(isEngineError(new Error("ordinary failure"))).toBe(false);
  });
});
