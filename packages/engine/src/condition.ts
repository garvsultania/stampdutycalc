import type { Condition } from "@stampdraft/schema";
import { evalExpr } from "./value-expr.js";
import { num, type Num } from "./money.js";

/**
 * Evaluate a modifier's applicability Condition against the caller's categorical
 * `facts`, numeric `values`, and the `execution_date`. Pure boolean logic over
 * data — gender/relation/area/amnesty applicability AND value thresholds (the
 * Delhi ₹25-lakh transfer-duty cliff) are decided without any branching in code
 * (PRD §5.5).
 */
export function evalCondition(
  cond: Condition,
  facts: Record<string, string | number>,
  executionDate: string,
  values: Record<string, Num> = {},
): boolean {
  if ("always" in cond) return true;
  if ("eq" in cond) return facts[cond.eq.field] === cond.eq.value;
  if ("in" in cond) {
    const v = facts[cond.in.field];
    return v !== undefined && cond.in.values.includes(v);
  }
  if ("cmp" in cond) {
    const left = evalExpr(cond.cmp.expr, values);
    const right = num(cond.cmp.value);
    switch (cond.cmp.op) {
      case "lt":
        return left.lessThan(right);
      case "lte":
        return left.lessThanOrEqualTo(right);
      case "gt":
        return left.greaterThan(right);
      case "gte":
        return left.greaterThanOrEqualTo(right);
      case "eq":
        return left.equals(right);
    }
  }
  if ("date_within" in cond) {
    const { from, to } = cond.date_within;
    if (from !== undefined && executionDate < from) return false;
    if (to !== undefined && executionDate > to) return false;
    return true;
  }
  if ("all" in cond) return cond.all.every((c) => evalCondition(c, facts, executionDate, values));
  if ("any" in cond) return cond.any.some((c) => evalCondition(c, facts, executionDate, values));
  return !evalCondition(cond.not, facts, executionDate, values);
}
