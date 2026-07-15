import type { Charge, RateSpec, Slab } from "@stampdraft/schema";
import { canonical, num, ZERO, type Num } from "./money.js";
import { evalExpr } from "./value-expr.js";
import { EngineError } from "./errors.js";
import type { Snapshot } from "./snapshot.js";

export interface ChargeCtx {
  /** Named numeric inputs + any `let` bindings introduced by enclosing formulas. */
  values: Record<string, Num>;
  /** Named categorical facts — read by category-selected rates (RateSpec). */
  facts: Record<string, string | number>;
  /** The active snapshot — cross-refs resolve ONLY here (PRD §5.3). */
  snapshot: Snapshot;
  /** rule_ids currently being resolved, for cross-ref cycle detection. */
  resolving: Set<string>;
}

/** Resolve an ad valorem rate: a plain number, or a category-selected rate. */
function resolveRate(pct: RateSpec, facts: Record<string, string | number>): number {
  if (typeof pct === "number") return pct;
  const value = facts[pct.by];
  const hit = pct.cases.find((c) => c.when === value);
  return hit ? hit.pct : pct.default;
}

/** Clamp a computed duty to its optional [min_duty, cap] window. */
function clamp(amount: Num, min?: string | number, cap?: string | number): Num {
  let out = amount;
  if (min !== undefined) {
    const m = num(min);
    if (out.lessThan(m)) out = m;
  }
  if (cap !== undefined) {
    const c = num(cap);
    if (out.greaterThan(c)) out = c;
  }
  return out;
}

/** Evaluate a Charge to a duty amount (Decimal). Recursive for formula/cross_ref. */
export function evalCharge(charge: Charge, ctx: ChargeCtx): Num {
  switch (charge.kind) {
    case "fixed":
      return num(charge.amount);

    case "ad_valorem": {
      const base = evalExpr(charge.base, ctx.values);
      const raw = base.times(resolveRate(charge.pct, ctx.facts)).div(100);
      return clamp(raw, charge.min_duty, charge.cap);
    }

    case "slab": {
      const base = evalExpr(charge.base, ctx.values);
      const raw = charge.variant === "marginal" ? marginalSlab(base, charge.slabs) : flatSlab(base, charge.slabs);
      return clamp(raw, charge.min_duty, charge.cap);
    }

    case "formula": {
      // `let` bindings evaluate in insertion order; each may reference earlier ones.
      const local: Record<string, Num> = { ...ctx.values };
      if (charge.let) {
        for (const [name, expr] of Object.entries(charge.let)) {
          local[name] = evalExpr(expr, local);
        }
      }
      const inner: ChargeCtx = { ...ctx, values: local };
      let sum = ZERO;
      for (const comp of charge.components) {
        sum = sum.plus(evalCharge(comp, inner));
      }
      return clamp(sum, charge.min_duty, charge.cap);
    }

    case "cross_ref":
      return evalCrossRef(charge, ctx);
  }
}

function flatSlab(base: Num, slabs: Slab[]): Num {
  for (const slab of slabs) {
    if (slab.upto === null || base.lessThanOrEqualTo(slab.upto)) {
      return slab.fixed !== undefined ? num(slab.fixed) : base.times(slab.pct as number).div(100);
    }
  }
  throw new EngineError(`value ${base.toFixed()} falls outside all slabs (add a terminal slab with upto: null)`);
}

function marginalSlab(base: Num, slabs: Slab[]): Num {
  let total = ZERO;
  let lower = ZERO;
  for (const slab of slabs) {
    const upper = slab.upto === null ? null : num(slab.upto);
    const portionTop = upper === null ? base : Num_min(base, upper);
    const portion = portionTop.minus(lower);
    if (portion.greaterThan(0)) {
      if (slab.fixed !== undefined) {
        // A fixed amount in a marginal table applies once when the base reaches
        // this band; treat as a flat add for the band it lands in.
        total = total.plus(num(slab.fixed));
      } else {
        total = total.plus(portion.times(slab.pct as number).div(100));
      }
    }
    if (upper !== null && base.lessThanOrEqualTo(upper)) break;
    lower = upper ?? lower;
  }
  return total;
}

function Num_min(a: Num, b: Num): Num {
  return a.lessThan(b) ? a : b;
}

function evalCrossRef(charge: Extract<Charge, { kind: "cross_ref" }>, ctx: ChargeCtx): Num {
  const target = ctx.snapshot.rulesById.get(charge.rule_id);
  if (!target) {
    throw new EngineError(
      `cross_ref target "${charge.rule_id}" is not active in the ${ctx.snapshot.jurisdiction} snapshot on ${ctx.snapshot.date}`,
    );
  }
  if (ctx.resolving.has(charge.rule_id)) {
    throw new EngineError(`cyclic cross_ref detected at "${charge.rule_id}"`);
  }
  const nextResolving = new Set(ctx.resolving);
  nextResolving.add(charge.rule_id);

  let targetCharge = target.charge;
  if (charge.on) {
    const rebasedValue = evalExpr(charge.on, ctx.values);
    targetCharge = rebase(targetCharge, rebasedValue);
  }
  return evalCharge(targetCharge, { ...ctx, resolving: nextResolving });
}

/**
 * Re-base a cross-ref target: "same duty as Conveyance, but computed on `premium`".
 * Only ad_valorem / slab charges can be re-based (their `base` is a single value
 * expression). Re-basing a formula/fixed/cross_ref target is ambiguous and is a
 * hard error rather than a silent guess.
 */
function rebase(charge: Charge, value: Num): Charge {
  if (charge.kind === "ad_valorem" || charge.kind === "slab") {
    return { ...charge, base: { lit: canonical(value) } };
  }
  throw new EngineError(`cross_ref 'on' can only re-base ad_valorem/slab targets, got "${charge.kind}"`);
}
