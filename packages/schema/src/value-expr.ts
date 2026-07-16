import { z } from "zod";
import { NumericStringSchema } from "./primitives.js";

/**
 * ValueExpr — a small, safe arithmetic AST evaluated over named numeric inputs.
 *
 * This is how the schema supports "arbitrary arithmetic expressions over named
 * inputs" (PRD §5.1) WITHOUT ever calling eval() or embedding a string DSL that
 * could smuggle non-determinism or code execution into the computation path.
 * Every node is data; the engine walks it with decimal.js.
 *
 * Named variables resolve against (a) the caller's numeric `values` (e.g.
 * consideration, avg_annual_rent, term_years, premium, refundable_deposit) and
 * (b) any `let` bindings introduced by an enclosing formula Charge.
 *
 *   higher-of-consideration-or-market-value  ->  { fn: "max", args: [{var:"consideration"},{var:"market_value"}] }
 *   average-annual-rent × a term-dependent multiple  ->  { op:"*", args:[{var:"avg_annual_rent"}, { band: { on:{var:"term_years"}, bands:[...] } }] }
 */
export type ValueExpr =
  | { var: string }
  | { lit: number | string }
  /**
   * `ceil_div` is the statutory idiom "for every rupees X **or part thereof**":
   * ceil(a / b). It appears wherever a schedule steps a fixed amount per slab of
   * value (e.g. MH Art 63 pre-2015: "Rs 100 for every Rs 1,00,000 or part thereof
   * above Rs 10 lakh"; KA Art 40A: "Rs 500 for every Rs 5 lakh or part thereof").
   * Modelled exactly rather than approximated — a plain division would silently
   * under-charge every partial slab.
   */
  | { op: "+" | "-" | "*" | "/" | "ceil_div"; args: [ValueExpr, ValueExpr] }
  | { fn: "max" | "min"; args: ValueExpr[] }
  | { band: { on: ValueExpr; bands: Array<{ upto: number | null; value: ValueExpr }> } };

export const ValueExprSchema: z.ZodType<ValueExpr> = z.lazy(() =>
  z.union([
    z.object({ var: z.string().min(1) }).strict(),
    z.object({ lit: z.union([z.number().finite(), NumericStringSchema]) }).strict(),
    z
      .object({
        op: z.enum(["+", "-", "*", "/", "ceil_div"]),
        args: z.tuple([ValueExprSchema, ValueExprSchema]),
      })
      .strict(),
    z
      .object({
        fn: z.enum(["max", "min"]),
        args: z.array(ValueExprSchema).min(1),
      })
      .strict(),
    z
      .object({
        band: z
          .object({
            on: ValueExprSchema,
            bands: z
              .array(
                z
                  .object({
                    // upper bound of this band, inclusive; null = open-ended (∞).
                    upto: z.number().nullable(),
                    value: ValueExprSchema,
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      })
      .strict(),
  ]),
);
