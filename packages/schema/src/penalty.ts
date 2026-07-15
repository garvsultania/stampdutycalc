import { z } from "zod";
import { JurisdictionSchema, MoneySchema } from "./primitives.js";
import { VersionMetaSchema } from "./provenance.js";

/**
 * PenaltyRegime — per-state deficit + penalty model (PRD §5.6, Flow D).
 *
 * Deficit is always (duty_then − duty_paid); it is derived, not encoded.
 * The penalty regime is either:
 *  - per_month           : rate-per-month on the deficit, optionally capped at a
 *                          multiple of the deficit (e.g. 2%/month, max 200%).
 *  - discretionary_range : "up to Nx" style. This ALWAYS yields a range
 *                          [min_multiple·deficit, max_multiple·deficit]; the
 *                          engine must never fabricate a point estimate the law
 *                          does not have (PRD §5.6, §14 Pass1.4).
 *
 * `adjudication_path` cites the S.31 / S.47A-equivalent route.
 */
export const PenaltyRegimeSchema = z
  .object({
    regime_id: z.string().min(1),
    jurisdiction: JurisdictionSchema,
    penalty: z.discriminatedUnion("type", [
      z
        .object({
          type: z.literal("per_month"),
          pct_per_month: z.number().nonnegative(),
          /** cap as a multiple of the deficit (e.g. 4 = 400%); null = uncapped. */
          cap_multiple: z.number().positive().nullable(),
          min_penalty: MoneySchema.nullable().default(null),
        })
        .strict(),
      z
        .object({
          type: z.literal("discretionary_range"),
          min_multiple: z.number().nonnegative(),
          max_multiple: z.number().nonnegative(),
        })
        .strict(),
    ]),
    adjudication_path: z.string().min(1),
    version: VersionMetaSchema,
    notes_for_reviewer: z.string().default(""),
  })
  .strict()
  .superRefine((regime, ctx) => {
    if (
      regime.penalty.type === "discretionary_range" &&
      regime.penalty.max_multiple < regime.penalty.min_multiple
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "max_multiple must be ≥ min_multiple",
        path: ["penalty", "max_multiple"],
      });
    }
  });
export type PenaltyRegime = z.infer<typeof PenaltyRegimeSchema>;
