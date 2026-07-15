import { z } from "zod";
import { MoneySchema } from "./primitives.js";
import { ValueExprSchema, type ValueExpr } from "./value-expr.js";

/**
 * RateSpec — an ad valorem percentage that may be a plain number OR selected by a
 * categorical fact. Delhi conveyance is the motivating case: 6% (male) / 4%
 * (female) / 5% (joint) are three EXACT statutory rates, not percentage-off
 * concessions (6% × ⅔ would not be a clean 4%). The selector reads a named fact
 * (e.g. buyer_category) and picks the matching rate, else `default`. Data-driven,
 * deterministic, no eval. See DECISIONS D8.
 */
export type RateSpec =
  | number
  | { by: string; cases: Array<{ when: string | number; pct: number }>; default: number };

export const RateSpecSchema = z.union([
  z.number(),
  z
    .object({
      by: z.string().min(1),
      cases: z.array(z.object({ when: z.union([z.string(), z.number()]), pct: z.number() }).strict()).min(1),
      default: z.number(),
    })
    .strict(),
]);

/**
 * A single slab row. Exactly one of `pct` or `fixed` must be present.
 * `upto` is the inclusive upper bound of the slab; null = the top (open) slab.
 */
export type Slab = { upto: number | null; pct?: number; fixed?: string | number };

export const SlabSchema = z
  .object({
    upto: z.number().nullable(),
    pct: z.number().optional(),
    fixed: MoneySchema.optional(),
  })
  .strict()
  .refine(
    (s) => (s.pct === undefined) !== (s.fixed === undefined),
    "a slab row must specify exactly one of `pct` or `fixed`",
  );

/**
 * Charge — the unified, recursive charging structure (approved deviation from the
 * illustrative split base/rate in PRD §6.1; see DECISIONS.md). One shape covers
 * every base/rate case in PRD §5.1–5.3:
 *
 *  - fixed       : a flat duty (₹100 affidavit).                          §5.1
 *  - ad_valorem  : pct of a value expression, with optional min/cap.      §5.1/5.2
 *  - slab        : marginal or flat-slab table over a value, min/cap.     §5.1
 *  - formula     : `let` bindings + a sum of sub-charges; the lease case  §5.1
 *                  (rent-multiple ad_valorem + premium-as-conveyance).
 *  - cross_ref   : "same duty as No. N", resolved ONLY within the active  §5.3
 *                  version snapshot; `on` optionally re-bases the target
 *                  (e.g. compute Conveyance duty on `premium`); `scale`
 *                  multiplies the target's duty (Art 23A: "ninety per cent
 *                  of the duty as a Conveyance").
 *  - switch      : banded sub-charges — selects a Charge by a numeric value
 *                  (Delhi lease: term band determines WHICH cross-ref
 *                  applies, Bond vs Conveyance, not just a multiple). A value
 *                  beyond every case throws (escalate-by-error, PRD §15).
 *
 * min_duty (floor) and cap (ceiling) are load-bearing — several Maharashtra
 * articles cap duty (PRD §5.2). They clamp the sub-total of the charge they sit on.
 */
export type Charge =
  | { kind: "fixed"; amount: string | number }
  | { kind: "ad_valorem"; base: ValueExpr; pct: RateSpec; min_duty?: string | number; cap?: string | number }
  | {
      kind: "slab";
      base: ValueExpr;
      variant: "marginal" | "flat";
      slabs: Slab[];
      min_duty?: string | number;
      cap?: string | number;
    }
  | {
      kind: "formula";
      let?: Record<string, ValueExpr>;
      components: Charge[];
      min_duty?: string | number;
      cap?: string | number;
    }
  | { kind: "cross_ref"; rule_id: string; on?: ValueExpr; scale?: number }
  | { kind: "switch"; on: ValueExpr; cases: Array<{ upto: number | null; charge: Charge }> };

export const ChargeSchema: z.ZodType<Charge> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("fixed"), amount: MoneySchema }).strict(),
    z
      .object({
        kind: z.literal("ad_valorem"),
        base: ValueExprSchema,
        pct: RateSpecSchema,
        min_duty: MoneySchema.optional(),
        cap: MoneySchema.optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("slab"),
        base: ValueExprSchema,
        variant: z.enum(["marginal", "flat"]),
        slabs: z.array(SlabSchema).min(1),
        min_duty: MoneySchema.optional(),
        cap: MoneySchema.optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("formula"),
        let: z.record(ValueExprSchema).optional(),
        components: z.array(ChargeSchema).min(1),
        min_duty: MoneySchema.optional(),
        cap: MoneySchema.optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("cross_ref"),
        rule_id: z.string().min(1),
        on: ValueExprSchema.optional(),
        scale: z.number().positive().optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("switch"),
        on: ValueExprSchema,
        cases: z
          .array(
            z
              .object({
                // inclusive upper bound; null = catch-all. No matching case → EngineError.
                upto: z.number().nullable(),
                charge: ChargeSchema,
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
  ]),
);
