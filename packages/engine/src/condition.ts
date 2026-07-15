import type { Condition } from "@stampdraft/schema";

/**
 * Evaluate a modifier's applicability Condition against the caller's categorical
 * `facts` and the `execution_date`. Pure boolean logic over data — this is how
 * gender/relation/area/amnesty applicability is decided without any branching in
 * code (PRD §5.5).
 */
export function evalCondition(
  cond: Condition,
  facts: Record<string, string | number>,
  executionDate: string,
): boolean {
  if ("always" in cond) return true;
  if ("eq" in cond) return facts[cond.eq.field] === cond.eq.value;
  if ("in" in cond) {
    const v = facts[cond.in.field];
    return v !== undefined && cond.in.values.includes(v);
  }
  if ("date_within" in cond) {
    const { from, to } = cond.date_within;
    if (from !== undefined && executionDate < from) return false;
    if (to !== undefined && executionDate > to) return false;
    return true;
  }
  if ("all" in cond) return cond.all.every((c) => evalCondition(c, facts, executionDate));
  if ("any" in cond) return cond.any.some((c) => evalCondition(c, facts, executionDate));
  return !evalCondition(cond.not, facts, executionDate);
}
