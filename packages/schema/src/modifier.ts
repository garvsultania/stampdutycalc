import { z } from "zod";
import { JurisdictionSchema, MoneySchema } from "./primitives.js";
import { VersionMetaSchema } from "./provenance.js";
import { ValueExprSchema, type ValueExpr } from "./value-expr.js";
import { RateSpecSchema, type RateSpec } from "./charge.js";
import { PendingVerificationSchema, type PendingVerification } from "./pending.js";

// Condition moved to its own module; re-exported so importers are unaffected.
export { ConditionSchema, type Condition } from "./condition.js";
import { ConditionSchema } from "./condition.js";


/**
 * Effect — what a modifier does to the running computation.
 *  - pct_add        : add pct% of a base as a new line. Base is "duty" (the
 *                     running post-concession duty) or any ValueExpr over the
 *                     inputs — because a surcharge's base can DIFFER from the
 *                     stamp base on the same instrument (Delhi transfer duty:
 *                     90% of consideration for a contract for transfer; 1/6 of
 *                     first-50-years' rent for a lease in perpetuity). The pct
 *                     may itself be category-selected (RateSpec) — Delhi
 *                     transfer duty is 4% male / 3% female, exact rates.
 *  - flat_add       : add a fixed amount as a new line.
 *  - duty_reduce_pct: reduce the running duty by pct% (concessions).
 * Every effect carries a human `label` for the breakup line item.
 */
export type Effect =
  | { op: "pct_add"; pct: RateSpec; of: "duty" | ValueExpr; label: string }
  | { op: "flat_add"; amount: string | number; label: string }
  | { op: "duty_reduce_pct"; pct: number; label: string };

export const EffectSchema: z.ZodType<Effect> = z.union([
  z
    .object({
      op: z.literal("pct_add"),
      pct: RateSpecSchema,
      of: z.union([z.literal("duty"), ValueExprSchema]),
      label: z.string().min(1),
    })
    .strict(),
  z.object({ op: z.literal("flat_add"), amount: MoneySchema, label: z.string().min(1) }).strict(),
  z.object({ op: z.literal("duty_reduce_pct"), pct: z.number(), label: z.string().min(1) }).strict(),
]);

/**
 * Modifier — a versioned, cited concession or surcharge/cess. Versioned and
 * citation-bound identically to rules: amnesty schemes and municipal-duty hikes
 * are inherently temporal and fit the append-only model (PRD §5.5).
 *
 * Delhi transfer duty (DMC Act 1957 s.147) is the canonical surcharge_cess: a
 * SEPARATE statute from the Stamp Act, applying only to the s.147 instrument
 * list, sometimes on a different base — hence a modifier attached per-rule, and
 * never imported through a cross_ref (cross_ref imports the target's charge
 * only; PRD §5.3, DECISIONS D10).
 *
 * `order` gives deterministic application order across multiple applicable
 * modifiers. Per-state relative-definition lists live inside `applies_when`
 * (enumerated, never generalized — PRD §14 Pass1.6).
 */
export const ModifierSchema = z
  .object({
    modifier_id: z.string().min(1),
    jurisdiction: JurisdictionSchema,
    kind: z.enum(["surcharge_cess", "concession"]),
    applies_when: ConditionSchema,
    effect: EffectSchema,
    order: z.number().int(),
    version: VersionMetaSchema,
    /**
     * Facts this modifier's applicability depends on. If any is absent from the
     * input the engine escalates rather than treating "fact missing" as "does not
     * apply" — that silent fallthrough is a substantive legal claim (e.g. "no
     * metro cess is due on this Mumbai flat") that nobody actually made.
     */
    requires_facts: z.array(z.string().min(1)).default([]),
    pending_verification: z.array(PendingVerificationSchema).default([]),
    notes_for_reviewer: z.string().default(""),
  })
  .strict();
export type Modifier = z.infer<typeof ModifierSchema>;
