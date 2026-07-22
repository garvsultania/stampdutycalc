import { z } from "zod";

const AttemptStatusSchema = z.enum(["not_attempted", "succeeded", "failed"]);
const CanaryObservationSchema = z.enum([
  "not_applicable",
  "matched",
  "explained_divergence",
  "unexplained_divergence",
]);

const AnsweredOutcomeSchema = z
  .object({
    outcome: z.literal("answered"),
    correctness: z.enum(["correct", "incorrect", "not_assessed"]),
  })
  .strict();

const RefusedOutcomeSchema = z
  .object({
    outcome: z.literal("refused"),
    refusal_code: z.string().min(1),
  })
  .strict();

export const BetaMatterObservationSchema = z
  .object({
    /** Opaque study identifier. Client/matter names do not belong in metrics. */
    observation_id: z.string().min(1),
    computation: z.discriminatedUnion("outcome", [AnsweredOutcomeSchema, RefusedOutcomeSchema]),
    canary: CanaryObservationSchema.default("not_applicable"),
    memo_export: AttemptStatusSchema.default("not_attempted"),
    audit_replay: AttemptStatusSchema.default("not_attempted"),
    tier2: z
      .object({
        model_version: z.string().min(1),
        fields: z
          .array(
            z
              .object({
                field: z.string().min(1),
                risk: z.enum(["high", "standard"]),
                edited: z.boolean(),
              })
              .strict(),
          )
          .min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type BetaMatterObservation = z.infer<typeof BetaMatterObservationSchema>;

const BetaObservationSetSchema = z.array(BetaMatterObservationSchema).superRefine((observations, ctx) => {
  const seen = new Set<string>();
  for (const [index, observation] of observations.entries()) {
    if (seen.has(observation.observation_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "observation_id"],
        message: `duplicate observation_id ${observation.observation_id}`,
      });
    }
    seen.add(observation.observation_id);
  }
});

export interface ReliabilityMetric {
  attempts: number;
  succeeded: number;
  failed: number;
  success_rate: number | null;
}

export interface Tier2EditMetric {
  model_version: string;
  field: string;
  risk: "high" | "standard";
  fields_shown: number;
  fields_edited: number;
  edit_rate: number;
}

export interface BetaMetrics {
  schema_version: 1;
  representative_matters: number;
  answers: number;
  refusals: number;
  answer_coverage: number | null;
  refusal_rate: number | null;
  assessed_answers: number;
  correct_answers: number;
  incorrect_answers: number;
  conditional_correctness: number | null;
  unexplained_divergences: number;
  memo_reliability: ReliabilityMetric;
  audit_replay_reliability: ReliabilityMetric;
  tier2_edit_rates: Tier2EditMetric[];
  methodology: {
    coverage: string;
    correctness: string;
    refusals: string;
  };
}

/** Aggregate only privacy-minimised beta observations. Refusals remain in the
 * coverage denominator but are deliberately absent from the correctness
 * denominator: failing closed is a coverage gap, not a wrong legal answer. */
export function aggregateBetaMetrics(input: readonly BetaMatterObservation[]): BetaMetrics {
  const observations = BetaObservationSetSchema.parse(input);
  const answered = observations.filter((observation) => observation.computation.outcome === "answered");
  const refused = observations.filter((observation) => observation.computation.outcome === "refused");
  const assessed = answered.filter(
    (observation) =>
      observation.computation.outcome === "answered" &&
      observation.computation.correctness !== "not_assessed",
  );
  const correct = assessed.filter(
    (observation) =>
      observation.computation.outcome === "answered" && observation.computation.correctness === "correct",
  );
  const incorrect = assessed.filter(
    (observation) =>
      observation.computation.outcome === "answered" && observation.computation.correctness === "incorrect",
  );

  return {
    schema_version: 1,
    representative_matters: observations.length,
    answers: answered.length,
    refusals: refused.length,
    answer_coverage: ratio(answered.length, observations.length),
    refusal_rate: ratio(refused.length, observations.length),
    assessed_answers: assessed.length,
    correct_answers: correct.length,
    incorrect_answers: incorrect.length,
    conditional_correctness: ratio(correct.length, assessed.length),
    unexplained_divergences: observations.filter(
      (observation) => observation.canary === "unexplained_divergence",
    ).length,
    memo_reliability: reliability(observations.map((observation) => observation.memo_export)),
    audit_replay_reliability: reliability(observations.map((observation) => observation.audit_replay)),
    tier2_edit_rates: tier2Metrics(observations),
    methodology: {
      coverage: "answered computations / all representative matters",
      correctness: "independently correct answers / independently assessed answers",
      refusals: "refusals / all representative matters; refusals are coverage gaps, never incorrect answers",
    },
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function reliability(statuses: Array<z.infer<typeof AttemptStatusSchema>>): ReliabilityMetric {
  const attempted = statuses.filter((status) => status !== "not_attempted");
  const succeeded = attempted.filter((status) => status === "succeeded").length;
  const failed = attempted.filter((status) => status === "failed").length;
  return {
    attempts: attempted.length,
    succeeded,
    failed,
    success_rate: ratio(succeeded, attempted.length),
  };
}

function tier2Metrics(observations: BetaMatterObservation[]): Tier2EditMetric[] {
  const groups = new Map<string, Omit<Tier2EditMetric, "edit_rate">>();
  for (const observation of observations) {
    if (!observation.tier2) continue;
    for (const field of observation.tier2.fields) {
      const key = `${observation.tier2.model_version}\u0000${field.risk}\u0000${field.field}`;
      const group = groups.get(key) ?? {
        model_version: observation.tier2.model_version,
        field: field.field,
        risk: field.risk,
        fields_shown: 0,
        fields_edited: 0,
      };
      group.fields_shown += 1;
      if (field.edited) group.fields_edited += 1;
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, edit_rate: group.fields_edited / group.fields_shown }))
    .sort((left, right) =>
      left.model_version.localeCompare(right.model_version) ||
      left.risk.localeCompare(right.risk) ||
      left.field.localeCompare(right.field),
    );
}
