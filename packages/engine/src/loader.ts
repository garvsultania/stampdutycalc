import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  ChargingRulesSchema,
  ClassificationTreeSchema,
  ModifierSchema,
  PenaltyRegimeSchema,
  RuleSchema,
  type ClassificationTree,
} from "@stampdraft/schema";
import type { RuleSet } from "./snapshot.js";

export interface LoadResult {
  ruleSet: RuleSet;
  trees: ClassificationTree[];
  /** files that failed to parse, with the zod message. */
  parseErrors: Array<{ file: string; message: string }>;
}

/**
 * Load a state directory into a RuleSet. Convention (PRD §6.3, one-instrument-
 * per-file for reviewable PRs):
 *
 *   <state>/rules/*.json          Rule | Rule[]
 *   <state>/modifiers/*.json      Modifier | Modifier[]
 *   <state>/classification/*.json ClassificationTree | ClassificationTree[]
 *   <state>/penalty.json          PenaltyRegime | PenaltyRegime[]
 *
 * Every object is validated against its Zod schema on ingest (fail-fast at the
 * data boundary). A file that fails validation is reported, not silently dropped.
 */
export function loadStateDir(stateDir: string): LoadResult {
  const parseErrors: Array<{ file: string; message: string }> = [];
  const rules = loadDir(join(stateDir, "rules"), RuleSchema, parseErrors);
  const modifiers = loadDir(join(stateDir, "modifiers"), ModifierSchema, parseErrors);
  const trees = loadDir(join(stateDir, "classification"), ClassificationTreeSchema, parseErrors);
  const penaltyRegimes = loadFile(join(stateDir, "penalty.json"), PenaltyRegimeSchema, parseErrors);
  const chargingRules = loadFile(join(stateDir, "charging.json"), ChargingRulesSchema, parseErrors);

  return { ruleSet: { rules, modifiers, penaltyRegimes, chargingRules }, trees, parseErrors };
}

/** Merge multiple state LoadResults into one corpus (for cross-state validation). */
export function mergeLoads(results: LoadResult[]): LoadResult {
  return {
    ruleSet: {
      rules: results.flatMap((r) => r.ruleSet.rules),
      modifiers: results.flatMap((r) => r.ruleSet.modifiers),
      penaltyRegimes: results.flatMap((r) => r.ruleSet.penaltyRegimes),
      chargingRules: results.flatMap((r) => r.ruleSet.chargingRules ?? []),
    },
    trees: results.flatMap((r) => r.trees),
    parseErrors: results.flatMap((r) => r.parseErrors),
  };
}

function loadDir<S extends z.ZodTypeAny>(
  dir: string,
  schema: S,
  parseErrors: Array<{ file: string; message: string }>,
): z.infer<S>[] {
  if (!existsSync(dir)) return [];
  const out: z.infer<S>[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    out.push(...loadFile(join(dir, name), schema, parseErrors));
  }
  return out;
}

function loadFile<S extends z.ZodTypeAny>(
  file: string,
  schema: S,
  parseErrors: Array<{ file: string; message: string }>,
): z.infer<S>[] {
  if (!existsSync(file)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    parseErrors.push({ file, message: `invalid JSON: ${(e as Error).message}` });
    return [];
  }
  const items = Array.isArray(raw) ? raw : [raw];
  const out: z.infer<S>[] = [];
  for (let i = 0; i < items.length; i++) {
    const parsed = schema.safeParse(items[i]);
    if (parsed.success) out.push(parsed.data);
    else parseErrors.push({ file: `${file}[${i}]`, message: parsed.error.message });
  }
  return out;
}
