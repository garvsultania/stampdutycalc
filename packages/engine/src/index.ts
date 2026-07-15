export { EngineError } from "./errors.js";
export { D, num, canonical, type Num } from "./money.js";
export { evalExpr } from "./value-expr.js";
export { evalCharge, type ChargeCtx } from "./charge.js";
export { evalCondition } from "./condition.js";
export { applyRounding } from "./rounding.js";
export { applyModifiers, type ModifierOutcome } from "./modifiers.js";
export { computePenalty, type PenaltyArgs } from "./penalty.js";
export { classify, type ClassifyResult } from "./classify.js";
export {
  buildSnapshot,
  resolveRule,
  hashSnapshot,
  canonicalJson,
  type RuleSet,
  type Snapshot,
} from "./snapshot.js";
export { compute, type ComputeOptions } from "./compute.js";
export { validateRuleSet, collectCrossRefs, type ValidationIssue } from "./validators.js";
export { loadStateDir, mergeLoads, type LoadResult } from "./loader.js";
export {
  runCase,
  loadGoldenDir,
  GoldenCaseSchema,
  type GoldenCase,
  type CaseResult,
} from "./golden.js";
