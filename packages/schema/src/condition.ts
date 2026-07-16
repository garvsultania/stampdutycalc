import { z } from "zod";
import { ValueExprSchema, type ValueExpr } from "./value-expr.js";

/**
 * Condition — a data predicate over the caller's categorical `facts`, numeric
 * `values`, and the `execution_date`. Drives applicability of concessions and
 * cesses (PRD §5.5): gender, family relation, buyer type, area classification,
 * time-bound amnesty windows, and VALUE THRESHOLDS (`cmp`) — e.g. Delhi's MCD
 * transfer-duty hike applying only to properties valued above ₹25 lakh
 * (flat-slab cliff on value, notification of 10 July 2023).
 */
export type Condition =
  | { always: true }
  | { eq: { field: string; value: string | number } }
  | { in: { field: string; values: Array<string | number> } }
  | { cmp: { expr: ValueExpr; op: "lt" | "lte" | "gt" | "gte" | "eq"; value: number } }
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
        cmp: z
          .object({
            expr: ValueExprSchema,
            op: z.enum(["lt", "lte", "gt", "gte", "eq"]),
            value: z.number(),
          })
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
