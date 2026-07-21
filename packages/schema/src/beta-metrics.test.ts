import { describe, expect, it } from "vitest";
import { aggregateBetaMetrics, type BetaMatterObservation } from "./beta-metrics.js";

describe("three-state beta metrics", () => {
  it("counts refusals as coverage gaps without calling them incorrect answers", () => {
    const metrics = aggregateBetaMetrics([
      observation("answered-correct", { outcome: "answered", correctness: "correct" }, {
        memo_export: "succeeded",
        audit_replay: "succeeded",
      }),
      observation("answered-incorrect", { outcome: "answered", correctness: "incorrect" }, {
        canary: "unexplained_divergence",
        memo_export: "failed",
      }),
      observation("answered-unassessed", { outcome: "answered", correctness: "not_assessed" }),
      observation("safe-refusal", { outcome: "refused", refusal_code: "LEGAL_REVIEW_REQUIRED" }),
    ]);

    expect(metrics).toMatchObject({
      representative_matters: 4,
      answers: 3,
      refusals: 1,
      answer_coverage: 0.75,
      refusal_rate: 0.25,
      assessed_answers: 2,
      correct_answers: 1,
      incorrect_answers: 1,
      conditional_correctness: 0.5,
      unexplained_divergences: 1,
      memo_reliability: { attempts: 2, succeeded: 1, failed: 1, success_rate: 0.5 },
      audit_replay_reliability: { attempts: 1, succeeded: 1, failed: 0, success_rate: 1 },
    });
    expect(metrics.methodology.refusals).toMatch(/coverage gaps, never incorrect answers/);
  });

  it("reports null rates for empty denominators and groups Tier 2 edits by model, risk, and field", () => {
    expect(aggregateBetaMetrics([])).toMatchObject({
      answer_coverage: null,
      refusal_rate: null,
      conditional_correctness: null,
      memo_reliability: { success_rate: null },
    });

    const metrics = aggregateBetaMetrics([
      observation("one", { outcome: "refused", refusal_code: "EVIDENCE_REQUIRED" }, {
        tier2: {
          model_version: "extractor-v1",
          fields: [
            { field: "consideration", risk: "high", edited: true },
            { field: "term_years", risk: "high", edited: false },
          ],
        },
      }),
      observation("two", { outcome: "refused", refusal_code: "EVIDENCE_REQUIRED" }, {
        tier2: {
          model_version: "extractor-v1",
          fields: [{ field: "consideration", risk: "high", edited: false }],
        },
      }),
    ]);

    expect(metrics.tier2_edit_rates).toEqual([
      {
        model_version: "extractor-v1",
        field: "consideration",
        risk: "high",
        fields_shown: 2,
        fields_edited: 1,
        edit_rate: 0.5,
      },
      {
        model_version: "extractor-v1",
        field: "term_years",
        risk: "high",
        fields_shown: 1,
        fields_edited: 0,
        edit_rate: 0,
      },
    ]);
  });

  it("rejects duplicate opaque observation identifiers", () => {
    expect(() => aggregateBetaMetrics([
      observation("duplicate", { outcome: "refused", refusal_code: "A" }),
      observation("duplicate", { outcome: "refused", refusal_code: "B" }),
    ])).toThrow(/duplicate observation_id/);
  });
});

function observation(
  observation_id: string,
  computation: BetaMatterObservation["computation"],
  extra: Partial<Omit<BetaMatterObservation, "observation_id" | "computation">> = {},
): BetaMatterObservation {
  return {
    observation_id,
    computation,
    canary: "not_applicable",
    memo_export: "not_attempted",
    audit_replay: "not_attempted",
    ...extra,
  };
}
