import type { ValueExpr } from "@stampdraft/schema";
import { num, type Num } from "./money.js";
import { EngineError } from "./errors.js";

/**
 * Evaluate a ValueExpr against a context of named Decimal values. Pure, total
 * except for well-defined error cases (unknown variable, division by zero, no
 * matching band) which throw EngineError rather than approximating.
 */
export function evalExpr(expr: ValueExpr, ctx: Record<string, Num>): Num {
  if ("var" in expr) {
    const v = ctx[expr.var];
    if (v === undefined) {
      throw new EngineError(`unknown input variable "${expr.var}"`);
    }
    return v;
  }
  if ("lit" in expr) {
    return num(expr.lit);
  }
  if ("op" in expr) {
    const a = evalExpr(expr.args[0], ctx);
    const b = evalExpr(expr.args[1], ctx);
    switch (expr.op) {
      case "+":
        return a.plus(b);
      case "-":
        return a.minus(b);
      case "*":
        return a.times(b);
      case "/":
        if (b.isZero()) throw new EngineError("division by zero in value expression");
        return a.div(b);
      case "ceil_div":
        // "for every rupees X or part thereof" — a partial slab counts in full.
        if (b.isZero()) throw new EngineError("division by zero in ceil_div value expression");
        return a.div(b).ceil();
    }
  }
  if ("fn" in expr) {
    const vals = expr.args.map((a) => evalExpr(a, ctx));
    return expr.fn === "max" ? Decimal_max(vals) : Decimal_min(vals);
  }
  // band
  const on = evalExpr(expr.band.on, ctx);
  for (const band of expr.band.bands) {
    if (band.upto === null || on.lessThanOrEqualTo(band.upto)) {
      return evalExpr(band.value, ctx);
    }
  }
  throw new EngineError(
    `value ${on.toFixed()} falls outside all bands (add a terminal band with upto: null)`,
  );
}

function Decimal_max(vals: Num[]): Num {
  return vals.reduce((acc, v) => (v.greaterThan(acc) ? v : acc));
}
function Decimal_min(vals: Num[]): Num {
  return vals.reduce((acc, v) => (v.lessThan(acc) ? v : acc));
}
