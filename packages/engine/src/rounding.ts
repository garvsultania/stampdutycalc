import type { Rounding } from "@stampdraft/schema";
import { num, ROUND_CEIL, ROUND_FLOOR, ROUND_HALF_UP, type Num } from "./money.js";

/**
 * Apply a per-state rounding rule (PRD §5.5). Applied LAST, to the assembled
 * pre-round total, and surfaced as its own breakup line. Rounds the multiple of
 * `nearest` up / to-nearest / down per `mode`.
 */
export function applyRounding(value: Num, rounding: Rounding): Num {
  if (rounding.mode === "none") return value;
  const nearest = num(rounding.nearest);
  const quotient = value.div(nearest);
  const mode =
    rounding.mode === "ceil" ? ROUND_CEIL : rounding.mode === "floor" ? ROUND_FLOOR : ROUND_HALF_UP;
  return quotient.toDecimalPlaces(0, mode).times(nearest);
}
