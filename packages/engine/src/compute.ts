import {
  ComputeInputSchema,
  type ComputeInput,
  type ComputeOutput,
  type Citation,
  type LineItem,
  type PenaltyRegime,
  type PenaltyResult,
} from "@stampdraft/schema";
import { canonical, num, type Num } from "./money.js";
import { buildSnapshot, resolveRule, type RuleSet } from "./snapshot.js";
import { evalCharge, type ChargeCtx } from "./charge.js";
import { applyModifiers } from "./modifiers.js";
import { applyRounding } from "./rounding.js";
import { computePenalty } from "./penalty.js";

export interface ComputeOptions {
  /** Per-state penalty regime — supply with input.duty_paid to run Flow D. */
  penaltyRegime?: PenaltyRegime;
  /** Whole months elapsed, for per_month penalty regimes. */
  penaltyMonths?: number;
}

/**
 * The deterministic computation entrypoint. Pure and LLM-free (handoff law #2):
 * resolve the rule version for the execution date → evaluate the charge → apply
 * modifiers → round last → assemble breakup + citations → attach the
 * `rules_version` hash of the active snapshot. Given {inputs, hash} the output is
 * reproducible byte-for-byte (PRD §7). No wall-clock timestamp is stamped here —
 * the audit layer records that separately so determinism holds.
 */
export function compute(ruleSet: RuleSet, rawInput: ComputeInput, opts: ComputeOptions = {}): ComputeOutput {
  const input = ComputeInputSchema.parse(rawInput);

  const snapshot = buildSnapshot(ruleSet, input.jurisdiction, input.execution_date);
  const rule = resolveRule(ruleSet, input.jurisdiction, input.rule_id, input.execution_date);

  const values: Record<string, Num> = {};
  for (const [k, v] of Object.entries(input.values)) values[k] = num(v);

  const ctx: ChargeCtx = { values, snapshot, resolving: new Set<string>() };
  const baseDuty = evalCharge(rule.charge, ctx);

  const baseLine: LineItem = {
    kind: "base_duty",
    label: `Base duty — ${rule.instrument} (Art. ${rule.article})`,
    amount: canonical(baseDuty),
    citations: [rule.version.source],
  };

  const mod = applyModifiers(baseDuty, rule, snapshot, values, input.facts, input.execution_date);
  const preRound = mod.preRoundTotal;
  const rounded = applyRounding(preRound, rule.rounding);
  const roundingDelta = rounded.minus(preRound);

  const breakup: LineItem[] = [baseLine, ...mod.lines];
  if (!roundingDelta.isZero()) {
    breakup.push({
      kind: "rounding",
      label: `Rounding (${rule.rounding.mode} to nearest ${rule.rounding.nearest})`,
      amount: canonical(roundingDelta),
      citations: [],
    });
  }

  const citations = dedupeCitations([rule.version.source, ...mod.citations]);

  let penalty: PenaltyResult | null = null;
  if (opts.penaltyRegime && input.duty_paid !== undefined) {
    penalty = computePenalty(opts.penaltyRegime, {
      dutyThen: rounded,
      dutyPaid: num(input.duty_paid),
      months: opts.penaltyMonths,
    });
  }

  return {
    rules_version: snapshot.hash,
    jurisdiction: input.jurisdiction,
    rule_id: rule.rule_id,
    instrument: rule.instrument,
    act: rule.act,
    article: rule.article,
    execution_date: input.execution_date,
    verified_as_of: rule.version.verified_on,
    breakup,
    total_duty: canonical(rounded),
    citations,
    escalations: [],
    warnings: [],
    penalty,
    inputs_echo: input,
  };
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of citations) {
    const key = JSON.stringify(c);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}
