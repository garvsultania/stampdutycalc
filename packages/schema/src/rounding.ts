import { z } from "zod";

/**
 * Rounding — applied LAST and shown explicitly in the breakup (PRD §5.5).
 * Per-state rules round the final duty up/near to the nearest ₹100 / ₹500 etc.
 * `mode: "none"` disables rounding (nearest is then irrelevant but must be ≥ 1).
 * Being wrong by ₹100 destroys trust disproportionately (PRD §14 Pass1.5), so
 * rounding is a first-class, data-driven step — never an implicit afterthought.
 */
export const RoundingSchema = z
  .object({
    mode: z.enum(["ceil", "round", "floor", "none"]),
    nearest: z.number().positive(),
  })
  .strict();
export type Rounding = z.infer<typeof RoundingSchema>;
