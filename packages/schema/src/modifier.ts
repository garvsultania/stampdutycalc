import { z } from "zod";
import { JurisdictionSchema, MoneySchema } from "./primitives.js";
import { VersionMetaSchema } from "./provenance.js";

/**
 * Condition — a data predicate over the caller's categorical `facts` and the
 * `execution_date`. Drives applicability of concessions and cesses (PRD §5.5):
 * gender, family relation, buyer type, area classification, and time-bound
 * amnesty/remission windows.
 */
export type Condition =
  | { always: true }
  | { eq: { field: string; value: string | number } }
  | { in: { field: string; values: Array<string | number> } }
  | { date_within: { from?: string; to?: string } }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ always: z.literal(true) }).strict(),
    z
      .object({ eq: z.object({ field: z.string().min(1), value: z.union([z.string(), z.number()]) }).strict() })
      .strict(),
    z
      .object({
        in: z
          .object({ field: z.string().min(1), values: z.array(z.union([z.string(), z.number()])).min(1) })
          .strict(),
      })
      .strict(),
    z
      .object({
        date_within: z.object({ from: z.string().optional(), to: z.string().optional() }).strict(),
      })
      .strict(),
    z.object({ all: z.array(ConditionSchema).min(1) }).strict(),
    z.object({ any: z.array(ConditionSchema).min(1) }).strict(),
    z.object({ not: ConditionSchema }).strict(),
  ]),
);

/**
 * Effect — what a modifier does to the running computation.
 *  - pct_add        : add pct% of {duty|consideration|market_value} as a new line
 *                     (metro cess, LBT, infrastructure cess — PRD §5.5 surcharges).
 *  - flat_add       : add a fixed amount as a new line.
 *  - duty_reduce_pct: reduce the base duty by pct% (gender/family/senior concession).
 * Every effect carries a human `label` for the breakup line item.
 */
export const EffectSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("pct_add"),
      pct: z.number(),
      of: z.enum(["duty", "consideration", "market_value"]),
      label: z.string().min(1),
    })
    .strict(),
  z.object({ op: z.literal("flat_add"), amount: MoneySchema, label: z.string().min(1) }).strict(),
  z.object({ op: z.literal("duty_reduce_pct"), pct: z.number(), label: z.string().min(1) }).strict(),
]);
export type Effect = z.infer<typeof EffectSchema>;

/**
 * Modifier — a versioned, cited concession or surcharge/cess. Versioned and
 * citation-bound identically to rules: amnesty schemes are inherently temporal
 * and are a natural fit for the append-only model (PRD §5.5).
 *
 * `order` gives deterministic application order across multiple applicable
 * modifiers (cesses computed on duty must see the same duty regardless of file
 * ordering). Per-state relative-definition lists live inside `applies_when`
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
    notes_for_reviewer: z.string().default(""),
  })
  .strict();
export type Modifier = z.infer<typeof ModifierSchema>;
