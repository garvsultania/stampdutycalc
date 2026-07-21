import {
  ComputeInputSchema,
  type ComputeInput,
  type ComputeOutput,
  type Citation,
  type LineItem,
  type PenaltyRegime,
  type PenaltyResult,
  type VersionMeta,
} from "@stampdraft/schema";
import { canonical, num, type Num } from "./money.js";
import {
  buildSnapshot,
  resolvePenaltyRegime,
  resolveRule,
  ruleSetFromSnapshotArchive,
  type RuleSet,
} from "./snapshot.js";
import { evalCharge, type ChargeCtx } from "./charge.js";
import { applyModifiers } from "./modifiers.js";
import { applyRounding } from "./rounding.js";
import { computePenalty } from "./penalty.js";
import { assertNotPending, collectPendingDependencies } from "./pending.js";
import { assertFounderVerified, verifiedAsOf, type VerificationDependency } from "./verification.js";
import { assertEvidenceBacked, type CitationDependency } from "./evidence.js";
import { EngineError } from "./errors.js";
import { assertInputContract, deriveInputFacts } from "./input-contract.js";

export interface ComputeOptions {
  /** Per-state penalty regime override. If omitted and input.duty_paid is set,
   * the active regime for the jurisdiction/date is resolved from the ruleset. */
  penaltyRegime?: PenaltyRegime;
  /** Whole months elapsed, for per_month penalty regimes. */
  penaltyMonths?: number;
  /**
   * Production safety gate. When true, every rule traversed through a
   * cross-reference, every applied modifier, and any penalty regime used by the
   * output must have founder verification metadata. Draft encoding tools leave
   * this false so unmerged rules can still be tested.
   */
  requireVerified?: boolean;
  /** Production evidence gate. Every legal dependency must carry a complete
   * Watchdog evidence link validated against the catalog in CI. */
  requireEvidence?: boolean;
  /** Explicit freshness boundary for requireEvidence. Required when that gate
   * is enabled so the deterministic engine never reads the wall clock. */
  evidenceAsOf?: string;
  /**
   * Test-only path for formula regression fixtures. It bypasses encoded pending
   * refusals so arithmetic can keep being checked while the normal eligibility
   * suite proves that users receive no figure. It cannot be combined with either
   * production gate and is never selected from an API request.
   */
  pendingPolicy?: "enforce" | "arithmetic-test-only";
}

export type ComputationDependencyKind = "rule" | "modifier" | "penalty";

export interface ComputationDependencyTrace {
  kind: ComputationDependencyKind;
  id: string;
  effective_from: string;
  effective_to: string | null;
  citation: Citation;
  verified_by: string | null;
  verified_on: string | null;
}

export interface ComputeTraceResult {
  output: ComputeOutput;
  /** Exact input-dependent legal graph: cross-reference targets and only the
   * modifiers/penalty regime that actually affected this computation. */
  dependencies: ComputationDependencyTrace[];
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
  return computeWithTrace(ruleSet, rawInput, opts).output;
}

/** Evaluate once and retain the exact dependency graph needed for a bounded
 * evidence/founder review packet. This does not bypass any computation gate. */
export function computeWithTrace(
  ruleSet: RuleSet,
  rawInput: ComputeInput,
  opts: ComputeOptions = {},
): ComputeTraceResult {
  if (
    opts.pendingPolicy === "arithmetic-test-only" &&
    (opts.requireVerified === true || opts.requireEvidence === true)
  ) {
    throw new EngineError("arithmetic-test-only pending policy cannot be used with production safety gates");
  }
  const input = ComputeInputSchema.parse(rawInput);

  const snapshot = buildSnapshot(ruleSet, input.jurisdiction, input.execution_date);
  const rule = resolveRule(ruleSet, input.jurisdiction, input.rule_id, input.execution_date);
  assertInputContract(rule, input);

  const values: Record<string, Num> = {};
  for (const [k, v] of Object.entries(input.values)) values[k] = num(v);
  const facts = deriveInputFacts(rule, input, values);

  const ruleDependencies = new Map([[rule.rule_id, rule]]);
  const ctx: ChargeCtx = {
    values,
    facts,
    snapshot,
    resolving: new Set([rule.rule_id]),
    ruleDependencies,
  };
  const baseDuty = evalCharge(rule.charge, ctx);

  const baseLine: LineItem = {
    kind: "base_duty",
    label: `Base duty — ${rule.instrument} (Art. ${rule.article})`,
    amount: canonical(baseDuty),
    citations: [rule.version.source],
  };

  const mod = applyModifiers(baseDuty, rule, snapshot, values, facts, input.execution_date);

  const penaltyRegime = input.duty_paid === undefined
    ? undefined
    : opts.penaltyRegime ?? resolvePenaltyRegime(ruleSet, input.jurisdiction, input.execution_date);
  const rulesUsed = [...ruleDependencies.values()];

  // Refuse before doing any more work. A cell the encoder marked unverified must
  // not reach a lawyer wearing the same confidence as a verified one. This must
  // include cross-ref targets: their charge is part of the returned figure.
  const pending = collectPendingDependencies(
    [
      ...rulesUsed.map((dependency) => ({
        source: dependency.rule_id,
        pending_verification: dependency.pending_verification,
      })),
      ...mod.applied.map((dependency) => ({
        source: dependency.modifier_id,
        pending_verification: dependency.pending_verification,
      })),
      ...(penaltyRegime
        ? [{ source: penaltyRegime.regime_id, pending_verification: penaltyRegime.pending_verification }]
        : []),
    ],
    facts,
    input.execution_date,
    values,
  );
  if (opts.pendingPolicy !== "arithmetic-test-only") assertNotPending(pending);
  const verificationDependencies: VerificationDependency[] = [
    ...rulesUsed.map((dependency) => ({ label: `rule ${dependency.rule_id}`, version: dependency.version })),
    ...mod.applied.map((dependency) => ({ label: `modifier ${dependency.modifier_id}`, version: dependency.version })),
    ...(penaltyRegime
      ? [{ label: `penalty regime ${penaltyRegime.regime_id}`, version: penaltyRegime.version }]
      : []),
  ];
  if (opts.requireVerified) {
    assertFounderVerified(
      verificationDependencies,
      input.duty_paid !== undefined && !penaltyRegime ? ["penalty regime (none active)"] : [],
    );
  }
  const citationDependencies: CitationDependency[] = [
    ...rulesUsed.map((dependency) => ({ label: `rule ${dependency.rule_id}`, citation: dependency.version.source })),
    ...mod.applied.map((dependency) => ({ label: `modifier ${dependency.modifier_id}`, citation: dependency.version.source })),
    ...(penaltyRegime
      ? [{ label: `penalty regime ${penaltyRegime.regime_id}`, citation: penaltyRegime.version.source }]
      : []),
  ];
  if (opts.requireEvidence) {
    if (!opts.evidenceAsOf) {
      throw new EngineError("requireEvidence needs an explicit evidenceAsOf date");
    }
    assertEvidenceBacked(citationDependencies, { asOf: opts.evidenceAsOf });
  }

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

  const citations = dedupeCitations([
    ...rulesUsed.map((dependency) => dependency.version.source),
    ...mod.citations,
    ...(penaltyRegime ? [penaltyRegime.version.source] : []),
  ]);

  let penalty: PenaltyResult | null = null;
  if (input.duty_paid !== undefined) {
    if (penaltyRegime) {
      penalty = computePenalty(penaltyRegime, {
        dutyThen: rounded,
        dutyPaid: num(input.duty_paid),
        months: opts.penaltyMonths,
      });
    }
  }

  const output: ComputeOutput = {
    rules_version: snapshot.hash,
    jurisdiction: input.jurisdiction,
    rule_id: rule.rule_id,
    instrument: rule.instrument,
    act: rule.act,
    article: rule.article,
    execution_date: input.execution_date,
    verified_as_of: verifiedAsOf(verificationDependencies),
    breakup,
    total_duty: canonical(rounded),
    citations,
    warnings: pending.warn,
    penalty,
    inputs_echo: input,
  };
  const dependencies: ComputationDependencyTrace[] = [
    ...rulesUsed.map((dependency) => dependencyTrace("rule", dependency.rule_id, dependency.version)),
    ...mod.applied.map((dependency) => dependencyTrace("modifier", dependency.modifier_id, dependency.version)),
    ...(penaltyRegime
      ? [dependencyTrace("penalty", penaltyRegime.regime_id, penaltyRegime.version)]
      : []),
  ];
  return { output, dependencies };
}

/** Replay only from a hash-verified archived snapshot, never from live rules. */
export function computeFromSnapshotArchive(
  snapshotArchive: unknown,
  expectedRulesVersion: string,
  rawInput: ComputeInput,
  opts: ComputeOptions = {},
): ComputeOutput {
  const output = compute(ruleSetFromSnapshotArchive(snapshotArchive, expectedRulesVersion), rawInput, opts);
  if (output.rules_version !== expectedRulesVersion) {
    throw new EngineError(
      `snapshot archive does not reproduce ${expectedRulesVersion} for ${output.execution_date}; got ${output.rules_version}`,
    );
  }
  return output;
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

function dependencyTrace(
  kind: ComputationDependencyKind,
  id: string,
  version: VersionMeta,
): ComputationDependencyTrace {
  return {
    kind,
    id,
    effective_from: version.effective_from,
    effective_to: version.effective_to,
    citation: version.source,
    verified_by: version.verified_by,
    verified_on: version.verified_on,
  };
}
