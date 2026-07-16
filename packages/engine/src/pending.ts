import { pendingSeverity, type Modifier, type Rule } from "@stampdraft/schema";
import { evalCondition } from "./condition.js";
import { EngineError } from "./errors.js";
import type { Num } from "./money.js";

export interface PendingFlags {
  /** Reasons the computation must not be returned at all. */
  refuse: string[];
  /** Reasons the computation is sound but carries a caveat. */
  warn: string[];
}

/**
 * Gather the pending-verification flags that actually bite on THIS input.
 *
 * A flag with no `when` applies to every computation of its rule/modifier; a
 * scoped flag fires only on the combination the encoder distrusted. Scoping is
 * what makes refusal affordable — Delhi transfer duty is verified for male and
 * female purchasers, so only the joint-above-₹25L cell refuses.
 */
export function collectPending(
  rule: Rule,
  appliedModifiers: Modifier[],
  facts: Record<string, string | number>,
  executionDate: string,
  values: Record<string, Num>,
): PendingFlags {
  const flags: PendingFlags = { refuse: [], warn: [] };

  const consider = (source: string, list: Rule["pending_verification"]) => {
    for (const p of list ?? []) {
      if (p.when && !evalCondition(p.when, facts, executionDate, values)) continue;
      flags[pendingSeverity(p)].push(`${source}: ${p.reason}`);
    }
  };

  consider(rule.rule_id, rule.pending_verification);
  for (const mod of appliedModifiers) consider(mod.modifier_id, mod.pending_verification);

  return flags;
}

/**
 * A modifier's applicability may hinge on a fact the caller never supplied. Left
 * alone, `applies_when` would simply not match and the modifier would drop out
 * silently — which asserts a legal conclusion ("no metro cess is due here") that
 * nobody actually reached. Escalate instead: an unanswered question is not a no.
 */
export function assertFactsPresent(mod: Modifier, facts: Record<string, string | number>): void {
  const missing = (mod.requires_facts ?? []).filter((f) => facts[f] === undefined);
  if (missing.length === 0) return;
  throw new EngineError(
    `modifier "${mod.modifier_id}" depends on fact${missing.length > 1 ? "s" : ""} ` +
      `${missing.map((m) => `"${m}"`).join(", ")}, which ${missing.length > 1 ? "were" : "was"} not provided. ` +
      `Answer it — a missing fact is not the same as the modifier not applying.`,
  );
}

/** Turn refuse-severity flags into the escalation the caller sees. */
export function assertNotPending(flags: PendingFlags): void {
  if (flags.refuse.length === 0) return;
  throw new EngineError(
    `this computation depends on law that is not verified yet, so no figure is returned. ` +
      flags.refuse.join(" | "),
  );
}
