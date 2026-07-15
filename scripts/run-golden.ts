/**
 * CI golden-suite gate (PRD §9). For each state, loads the ruleset and its golden
 * scenarios and runs them. Fails the build (exit 1) if any case fails or any
 * fixture fails to parse. "No rules version activates unless the state's golden
 * suite passes 100%."
 *
 * Run against real state directories (rules/<STATE> + golden/<STATE>); empty
 * until M1. The synthetic M0 suite is exercised separately via `pnpm test`.
 */
import { loadGoldenDir, loadStateDir, runCase } from "@stampdraft/engine";

const STATES = ["DL", "MH", "KA"] as const;

let totalFail = 0;
let totalCases = 0;

for (const state of STATES) {
  const { ruleSet, parseErrors } = loadStateDir(`rules/${state}`);
  for (const pe of parseErrors) {
    process.stderr.write(`ERROR [${state}] parse ${pe.file}: ${pe.message}\n`);
    totalFail++;
  }

  const cases = loadGoldenDir(`golden/${state}`);
  totalCases += cases.length;
  let stateFail = 0;

  for (const c of cases) {
    const r = runCase(ruleSet, c);
    if (!r.pass) {
      stateFail++;
      totalFail++;
      process.stderr.write(`FAIL [${state}] ${r.name}\n`);
      for (const f of r.failures) process.stderr.write(`     - ${f}\n`);
    }
  }

  process.stdout.write(`golden ${state}: ${cases.length - stateFail}/${cases.length} passed\n`);
}

process.stdout.write(`\ngolden: ${totalCases - totalFail} of ${totalCases} case(s) passed across ${STATES.length} state(s)\n`);
process.exit(totalFail === 0 ? 0 : 1);
