import { Decimal } from "decimal.js";

/**
 * Configured Decimal constructor for all money and value arithmetic.
 *
 * DETERMINISM (PRD §7, handoff law #5): no IEEE float ever touches a computation.
 * Every value flows through this arbitrary-precision Decimal. Precision is set
 * high (40 sig figs) so the only non-terminating operation in the model — an
 * explicit "/" in a ValueExpr — cannot silently lose determinism; output is then
 * normalised to a canonical string. Same inputs + same rules_version ⇒ identical
 * bytes, always.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** An exact numeric value (a Decimal instance). */
export type Num = Decimal;

export const ROUND_CEIL = Decimal.ROUND_CEIL;
export const ROUND_FLOOR = Decimal.ROUND_FLOOR;
export const ROUND_HALF_UP = Decimal.ROUND_HALF_UP;

export function num(v: string | number | Decimal): Num {
  return new D(v);
}

export const ZERO: Num = num(0);

/**
 * Canonical money/value string: fixed-point (never exponential), tails beyond
 * 4 decimal places rounded away (half-up) so an explicit division cannot leak an
 * infinite tail into the audit record. Duties are whole rupees in practice; this
 * simply guarantees a single, reproducible textual form.
 */
export function canonical(v: Num): string {
  const capped = v.decimalPlaces() > 4 ? v.toDecimalPlaces(4, ROUND_HALF_UP) : v;
  // toFixed() with no argument = exact fixed-point notation, no exponent.
  return capped.toFixed();
}
