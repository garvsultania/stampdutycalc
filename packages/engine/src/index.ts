export { EngineError } from "./errors.js";
export {
  assertEvidenceBacked,
  collectCorpusEvidenceDependencies,
  citationEvidenceIssues,
  evidenceCoverage,
  type CitationDependency,
  type CorpusEvidenceDependency,
  type CorpusEvidenceKind,
  type EvidenceCoverage,
  type EvidenceCoverageEntry,
  type EvidenceGateOptions,
  type EvidenceCatalog,
} from "./evidence.js";
export { D, num, canonical, type Num } from "./money.js";
export { evalExpr } from "./value-expr.js";
export { evalCharge, resolveRate, type ChargeCtx } from "./charge.js";
export { evalCondition } from "./condition.js";
export { applyRounding } from "./rounding.js";
export { applyModifiers, type ModifierOutcome } from "./modifiers.js";
export { computePenalty, type PenaltyArgs } from "./penalty.js";
export {
  classify,
  resolveClassificationTree,
  type ClassifyOptions,
  type ClassifyResult,
} from "./classify.js";
export {
  buildSnapshot,
  resolveRule,
  resolvePenaltyRegime,
  resolveChargingRules,
  hashSnapshot,
  canonicalJson,
  type RuleSet,
  type Snapshot,
} from "./snapshot.js";
export { compute, type ComputeOptions } from "./compute.js";
export {
  computeS4,
  computeS5,
  computeS6,
  compareS5S6,
  type ChargingAnalysisOptions,
  type NamedInstrument,
  type S4Result,
  type S5Result,
  type S6Result,
  type S5S6Comparison,
} from "./charging.js";
export {
  computeInterStateDifferential,
  type DifferentialResult,
} from "./differential.js";
export { validateRuleSet, collectCrossRefs, type ValidationIssue } from "./validators.js";
export { loadStateDir, mergeLoads, type LoadResult } from "./loader.js";
export {
  runCase,
  loadGoldenDir,
  GoldenCaseSchema,
  type GoldenCase,
  type CaseResult,
} from "./golden.js";
