import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ComputeInputSchema, type LineItem, type PenaltyResult } from "@stampdraft/schema";
import { compute } from "./compute.js";
import type { RuleSet } from "./snapshot.js";
import { EngineError } from "./errors.js";

/**
 * A golden case: a lawyer-verified scenario with its expected output (PRD §9).
 * The golden suite is the ship gate — no rules version activates unless its
 * state suite passes 100% (§9 CI gate). A case may assert on any subset of the
 * output; unspecified fields are not checked. `expect.error` asserts the
 * computation throws with a message containing that substring.
 */
export const GoldenCaseSchema = z
  .object({
    name: z.string().min(1),
    /** free-text pointer to statute/notification backing the expected number */
    source_note: z.string().optional(),
    input: ComputeInputSchema,
    penalty_regime_id: z.string().optional(),
    penalty_months: z.number().optional(),
    expect: z
      .object({
        total_duty: z.string().optional(),
        rules_version: z.string().optional(),
        breakup: z.array(z.any()).optional(),
        penalty: z.record(z.any()).optional(),
        error: z.string().optional(),
      })
      .strict(),
  })
  .strict();
export type GoldenCase = z.infer<typeof GoldenCaseSchema>;

export interface CaseResult {
  name: string;
  pass: boolean;
  failures: string[];
}

/** Run one golden case against a ruleset and diff it against expectations. */
export function runCase(ruleSet: RuleSet, c: GoldenCase): CaseResult {
  const failures: string[] = [];

  if (c.expect.error !== undefined) {
    try {
      compute(ruleSet, c.input, resolvePenaltyOpts(ruleSet, c));
      failures.push(`expected an error containing "${c.expect.error}" but computation succeeded`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes(c.expect.error)) {
        failures.push(`error "${msg}" does not contain expected "${c.expect.error}"`);
      }
    }
    return { name: c.name, pass: failures.length === 0, failures };
  }

  let out;
  try {
    out = compute(ruleSet, c.input, resolvePenaltyOpts(ruleSet, c));
  } catch (e) {
    return { name: c.name, pass: false, failures: [`unexpected error: ${(e as Error).message}`] };
  }

  if (c.expect.total_duty !== undefined && out.total_duty !== c.expect.total_duty) {
    failures.push(`total_duty: expected ${c.expect.total_duty}, got ${out.total_duty}`);
  }
  if (c.expect.rules_version !== undefined && out.rules_version !== c.expect.rules_version) {
    failures.push(`rules_version: expected ${c.expect.rules_version}, got ${out.rules_version}`);
  }
  if (c.expect.breakup !== undefined) {
    diffBreakup(c.expect.breakup as Partial<LineItem>[], out.breakup, failures);
  }
  if (c.expect.penalty !== undefined) {
    diffObject(c.expect.penalty, out.penalty, "penalty", failures);
  }

  return { name: c.name, pass: failures.length === 0, failures };
}

function resolvePenaltyOpts(ruleSet: RuleSet, c: GoldenCase) {
  const opts: { penaltyRegime?: (typeof ruleSet.penaltyRegimes)[number]; penaltyMonths?: number } = {};
  if (c.penalty_months !== undefined) opts.penaltyMonths = c.penalty_months;
  // Only override the auto-resolved regime when a specific id is named.
  if (c.penalty_regime_id) {
    const regime = ruleSet.penaltyRegimes.find(
      (p) => p.jurisdiction === c.input.jurisdiction && p.regime_id === c.penalty_regime_id,
    );
    if (!regime) throw new EngineError(`golden case "${c.name}" references unknown penalty regime "${c.penalty_regime_id}"`);
    opts.penaltyRegime = regime;
  }
  return opts;
}

function diffBreakup(expected: Partial<LineItem>[], actual: LineItem[], failures: string[]): void {
  if (expected.length !== actual.length) {
    failures.push(`breakup length: expected ${expected.length}, got ${actual.length}`);
    return;
  }
  expected.forEach((exp, i) => {
    const act = actual[i]!;
    for (const key of Object.keys(exp) as (keyof LineItem)[]) {
      if (key === "citations") continue;
      if (JSON.stringify(exp[key]) !== JSON.stringify(act[key])) {
        failures.push(`breakup[${i}].${key}: expected ${JSON.stringify(exp[key])}, got ${JSON.stringify(act[key])}`);
      }
    }
  });
}

function diffObject(expected: Record<string, unknown>, actual: unknown, path: string, failures: string[]): void {
  if (actual === null || actual === undefined) {
    failures.push(`${path}: expected an object, got ${String(actual)}`);
    return;
  }
  for (const [k, v] of Object.entries(expected)) {
    const av = (actual as Record<string, unknown>)[k];
    if (JSON.stringify(v) !== JSON.stringify(av)) {
      failures.push(`${path}.${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(av)}`);
    }
  }
}

/** Load golden cases from a directory of *.json (each a case or array of cases). */
export function loadGoldenDir(dir: string): GoldenCase[] {
  if (!existsSync(dir)) return [];
  const cases: GoldenCase[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const raw = JSON.parse(readFileSync(join(dir, name), "utf8"));
    const items = Array.isArray(raw) ? raw : [raw];
    for (const item of items) cases.push(GoldenCaseSchema.parse(item));
  }
  return cases;
}
