import type { ClassificationTree } from "@stampdraft/schema";
import { EngineError } from "./errors.js";

export type ClassifyResult =
  | { status: "resolved"; instrument: string; article: string; rule_id: string; path: string[] }
  | { status: "escalate"; reason: string; path: string[] }
  | { status: "incomplete"; node: string; question: string; legal_test: string; options: string[]; path: string[] };

/**
 * Walk a classification tree given a map of node-id → chosen answer (PRD §6.2,
 * Flow B). Terminal nodes resolve to a Schedule entry; escalate nodes stop with a
 * reason (grey zone — the tree escalates rather than guessing); a missing answer
 * returns `incomplete` so the UI can ask the next question. An answer that
 * matches no edge is itself an escalation — the tree never silently guesses.
 */
export function classify(tree: ClassificationTree, answers: Record<string, string>): ClassifyResult {
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
