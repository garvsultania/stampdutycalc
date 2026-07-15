import type { PenaltyRegime, PenaltyResult } from "@stampdraft/schema";
import { canonical, num, ZERO, type Num } from "./money.js";
import { EngineError } from "./errors.js";

export interface PenaltyArgs {
  /** Correct duty as on the execution date (the rounded total_duty). */
  dutyThen: Num;
  /** Duty actually paid at execution. */
  dutyPaid: Num;
  /** Whole months elapsed — REQUIRED for per_month regimes. Passed in (not read
   * from a clock) so the computation stays pure and reproducible. */
  months?: number;
}

/**
 * Deficit + penalty computation (PRD §5.6, Flow D).
 *
 * Deficit = max(0, dutyThen − dutyPaid). A discretionary "up to Nx" regime ALWAYS
 * returns a RANGE — never a fabricated point estimate — plus the adjudication path
 * (S.31 / S.47A equivalent). A per-month regime returns a point figure, optionally
 * capped at a multiple of the deficit and floored at a minimum penalty.
 */
export function computePenalty(regime: PenaltyRegime, args: PenaltyArgs): PenaltyResult {
  const rawDeficit = args.dutyThen.minus(args.dutyPaid);
  const deficit = rawDeficit.greaterThan(0) ? rawDeficit : ZERO;
  const cite = regime.version.source;
  const adjudication = regime.adjudication_path;

  if (deficit.isZero()) {
    return {
      deficit: canonical(ZERO),
      penalty_point: canonical(ZERO),
      penalty_range: null,
      total_payable_point: canonical(ZERO),
      total_payable_range: null,
      adjudication_path: adjudication,
      citations: [cite],
    };
  }

  if (regime.penalty.type === "per_month") {
    if (args.months === undefined) {
      throw new EngineError(`penalty regime "${regime.regime_id}" is per_month but no month count was provided`);
    }
    let penalty = deficit.times(regime.penalty.pct_per_month).div(100).times(args.months);
    if (regime.penalty.cap_multiple !== null) {
      const cap = deficit.times(regime.penalty.cap_multiple);
      if (penalty.greaterThan(cap)) penalty = cap;
    }
    if (regime.penalty.min_penalty !== null) {
      const min = num(regime.penalty.min_penalty);
      if (penalty.lessThan(min)) penalty = min;
    }
    return {
      deficit: canonical(deficit),
      penalty_point: canonical(penalty),
      penalty_range: null,
      total_payable_point: canonical(deficit.plus(penalty)),
      total_payable_range: null,
      adjudication_path: adjudication,
      citations: [cite],
    };
  }

  // discretionary_range — output a range, never a point estimate.
  const pMin = deficit.times(regime.penalty.min_multiple);
  const pMax = deficit.times(regime.penalty.max_multiple);
  return {
    deficit: canonical(deficit),
    penalty_point: null,
    penalty_range: { min: canonical(pMin), max: canonical(pMax) },
    total_payable_point: null,
    total_payable_range: { min: canonical(deficit.plus(pMin)), max: canonical(deficit.plus(pMax)) },
    adjudication_path: adjudication,
    citations: [cite],
  };
}
