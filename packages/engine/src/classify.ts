import { ISODateSchema, type ClassificationTree } from "@stampdraft/schema";
import { EngineError } from "./errors.js";
import { assertNotPending, collectPendingDependencies } from "./pending.js";
import { assertFounderVerified } from "./verification.js";
import { assertEvidenceBacked } from "./evidence.js";

export type ClassifyResult =
  | { status: "resolved"; instrument: string; article: string; rule_id: string; path: string[] }
  | { status: "escalate"; reason: string; path: string[] }
  | { status: "incomplete"; node: string; question: string; legal_test: string; options: string[]; path: string[] };

export interface ClassifyOptions {
  /** Execution date used by date-scoped refusal flags and version validity. */
  executionDate?: string;
  /** Production safety gate for the classification tree itself. */
  requireVerified?: boolean;
  /** Production safety gate for immutable primary evidence. */
  requireEvidence?: boolean;
  /** Explicit freshness boundary for requireEvidence. */
  evidenceAsOf?: string;
}

/** Resolve the tree version active on the instrument's execution date. */
export function resolveClassificationTree(
  trees: readonly ClassificationTree[],
  treeId: string,
  rawExecutionDate: string,
): ClassificationTree {
  const executionDate = ISODateSchema.parse(rawExecutionDate);
  const active = trees.filter(
    (tree) =>
      tree.tree_id === treeId &&
      tree.version.effective_from <= executionDate &&
      (tree.version.effective_to === null || executionDate < tree.version.effective_to),
  );
  if (active.length === 0) {
    throw new EngineError(`classification tree "${treeId}" has no version effective on ${executionDate}`);
  }
  return active.reduce((latest, candidate) =>
    candidate.version.effective_from > latest.version.effective_from ? candidate : latest,
  );
}

/**
 * Walk a classification tree given a map of node-id → chosen answer (PRD §6.2,
 * Flow B). Terminal nodes resolve to a Schedule entry; escalate nodes stop with a
 * reason (grey zone — the tree escalates rather than guessing); a missing answer
 * returns `incomplete` so the UI can ask the next question. An answer that
 * matches no edge is itself an escalation — the tree never silently guesses.
 */
export function classify(
  tree: ClassificationTree,
  answers: Record<string, string>,
  opts: ClassifyOptions = {},
): ClassifyResult {
  if (tree.pending_verification.length > 0 && !opts.executionDate) {
    throw new EngineError(
      `classification tree "${tree.tree_id}" has pending verification flags; executionDate is required`,
    );
  }
  const executionDate = ISODateSchema.parse(opts.executionDate ?? tree.version.effective_from);
  if (
    executionDate < tree.version.effective_from ||
    (tree.version.effective_to !== null && executionDate >= tree.version.effective_to)
  ) {
    throw new EngineError(`classification tree "${tree.tree_id}" is not effective on ${executionDate}`);
  }

  const pending = collectPendingDependencies(
    [{ source: tree.tree_id, pending_verification: tree.pending_verification }],
    answers,
    executionDate,
    {},
  );
  assertNotPending(pending);
  if (opts.requireVerified) {
    assertFounderVerified([{ label: `classification tree ${tree.tree_id}`, version: tree.version }]);
  }
  if (opts.requireEvidence) {
    if (!opts.evidenceAsOf) {
      throw new EngineError("requireEvidence needs an explicit evidenceAsOf date");
    }
    assertEvidenceBacked(
      [{ label: `classification tree ${tree.tree_id}`, citation: tree.version.source }],
      { asOf: opts.evidenceAsOf },
    );
  }

  const path: string[] = [];
  let current = tree.root;
  const guard = new Set<string>();

  for (;;) {
    if (guard.has(current)) {
      throw new EngineError(`cycle in classification tree "${tree.tree_id}" at node "${current}"`);
    }
    guard.add(current);
    path.push(current);

    const node = tree.nodes[current];
    if (!node) throw new EngineError(`classification tree "${tree.tree_id}" references missing node "${current}"`);

    if (node.type === "terminal") {
      return { status: "resolved", instrument: node.instrument, article: node.article, rule_id: node.rule_id, path };
    }
    if (node.type === "escalate") {
      return { status: "escalate", reason: node.reason, path };
    }

    const answer = answers[current];
    if (answer === undefined) {
      return {
        status: "incomplete",
        node: current,
        question: node.text,
        legal_test: node.legal_test,
        options: node.edges.map((e) => e.answer),
        path,
      };
    }
    const edge = node.edges.find((e) => e.answer === answer);
    if (!edge) {
      return {
        status: "escalate",
        reason: `answer "${answer}" at "${current}" matches no defined edge — classification is outside the encoded tests`,
        path,
      };
    }
    current = edge.to;
  }
}
