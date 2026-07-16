import type { Citation, LineItem, Modifier, Rule } from "@stampdraft/schema";
import { canonical, num, ZERO, type Num } from "./money.js";
import { evalCondition } from "./condition.js";
import { evalExpr } from "./value-expr.js";
import { resolveRate } from "./charge.js";
import type { Snapshot } from "./snapshot.js";
import { assertFactsPresent } from "./pending.js";

export interface ModifierOutcome {
  lines: LineItem[];
  preRoundTotal: Num;
  citations: Citation[];
  /** The modifiers that actually fired — the caller checks their pending flags. */
  applied: Modifier[];
}

/**
 * Apply a rule's modifiers (concessions and surcharges/cesses) to a base duty,
 * deterministically ordered by `order` then `modifier_id`. Concessions reduce the
 * running duty; surcharges/cesses are additive lines computed on the running duty
 * or on a named input value. Each produces its own breakup line with its own
 * citation. Rounding is NOT applied here — it is the caller's final step (§5.5).
 *
 * A modifier id referenced by the rule but not active in the snapshot on this
 * date is legitimately skipped (e.g. a lapsed amnesty). Referential existence is
 * guaranteed by the ruleset validator.
 */
export function applyModifiers(
  baseDuty: Num,
  rule: Rule,
  snapshot: Snapshot,
  values: Record<string, Num>,
  facts: Record<string, string | number>,
  executionDate: string,
): ModifierOutcome {
  const applicable: Modifier[] = [];
  for (const id of rule.modifiers) {
    const mod = snapshot.modifiersById.get(id);
    if (!mod) continue; // not active on this date
    // Check BEFORE evaluating applicability: if a fact the gate depends on is
    // missing, the honest answer is "ask", not a quiet non-application.
    assertFactsPresent(mod, facts);
    if (evalCondition(mod.applies_when, facts, executionDate, values)) applicable.push(mod);
  }
  applicable.sort((a, b) => a.order - b.order || (a.modifier_id < b.modifier_id ? -1 : 1));

  const lines: LineItem[] = [];
  const citations: Citation[] = [];
  let runningDuty = baseDuty;
  let addOns = ZERO;

  for (const mod of applicable) {
    const cite = mod.version.source;
    const eff = mod.effect;
    // The breakup line reflects what the modifier IS (mod.kind), not how it is
    // arithmetically expressed. A concession implemented as a negative pct_add
    // (e.g. Maharashtra's −1% women concession, a percentage-POINT reduction)
    // must still render as a concession line, not a surcharge.
    const lineKind: LineItem["kind"] = mod.kind === "concession" ? "concession" : "surcharge_cess";
    if (eff.op === "duty_reduce_pct") {
      const reduction = runningDuty.times(eff.pct).div(100);
      runningDuty = runningDuty.minus(reduction);
      lines.push({ kind: lineKind, label: eff.label, amount: canonical(reduction.negated()), citations: [cite] });
    } else if (eff.op === "flat_add") {
      const amt = num(eff.amount);
      addOns = addOns.plus(amt);
      lines.push({ kind: lineKind, label: eff.label, amount: canonical(amt), citations: [cite] });
    } else {
      // pct_add — base is the running duty or any expression over the inputs
      // (a surcharge's base can differ from the stamp base, e.g. Delhi transfer
      // duty on 90% of consideration for a contract for transfer). The rate may
      // be category-selected (RateSpec).
      const base = eff.of === "duty" ? runningDuty : evalExpr(eff.of, values);
      const amt = base.times(resolveRate(eff.pct, facts)).div(100);
      addOns = addOns.plus(amt);
      lines.push({ kind: lineKind, label: eff.label, amount: canonical(amt), citations: [cite] });
    }
    citations.push(cite);
  }

  return { lines, preRoundTotal: runningDuty.plus(addOns), citations, applied: applicable };
}
