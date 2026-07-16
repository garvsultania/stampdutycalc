/**
 * CI citation + integrity gate (PRD §6.3, §9). Loads each state's ruleset and
 * runs the structural validator. Fails the build (exit 1) on any parse error or
 * `error`-level issue — this is what blocks a PR merge when an active rule lacks
 * a citation or the append-only / cross-ref invariants are violated.
 *
 * Run against real state directories (rules/<STATE>); empty until M1.
 */
import { loadStateDir, validateRuleSet } from "@stampdraft/engine";

const STATES = ["DL", "MH", "KA"] as const;

let errorCount = 0;
let warningCount = 0;

for (const state of STATES) {
  const dir = `rules/${state}`;
  const load = loadStateDir(dir);

  for (const pe of load.parseErrors) {
    process.stderr.write(`ERROR  [${state}] parse ${pe.file}: ${pe.message}\n`);
    errorCount++;
  }

  const issues = validateRuleSet(load.ruleSet, load.trees);
  for (const issue of issues) {
    if (issue.level === "error") errorCount++;
    else warningCount++;
    process.stderr.write(`${issue.level.toUpperCase()}  [${state}] ${issue.where}: ${issue.message}\n`);
  }

  const ruleCount = load.ruleSet.rules.length;
  process.stdout.write(`validate ${state}: ${ruleCount} rule version(s), ${load.trees.length} tree(s)\n`);
}

process.stdout.write(`\nvalidate: ${errorCount} error(s), ${warningCount} warning(s)\n`);
process.exit(errorCount === 0 ? 0 : 1);
