#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildSnapshot, compute, loadGoldenDir, loadStateDir, runCase, validateRuleSet } from "@stampdraft/engine";
import type { ComputeInput, Jurisdiction } from "@stampdraft/schema";

/**
 * StampDraft CLI — makes founder golden-suite verification scriptable rather than
 * click-through (PRD §6.6). Zero LLM, pure engine.
 *
 *   stampdraft validate --rules <dir>
 *   stampdraft golden   --rules <dir> --golden <dir>
 *   stampdraft hash     --rules <dir> --state <DL|MH|KA> --date <YYYY-MM-DD>
 *   stampdraft compute  --rules <dir> --input <input.json>
 */
function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const args = parseFlags(rest);

  switch (cmd) {
    case "validate":
      return cmdValidate(req(args, "rules"));
    case "golden":
      return cmdGolden(req(args, "rules"), req(args, "golden"));
    case "hash":
      return cmdHash(req(args, "rules"), req(args, "state") as Jurisdiction, req(args, "date"));
    case "compute":
      return cmdCompute(req(args, "rules"), req(args, "input"));
    default:
      process.stderr.write(`unknown command "${cmd ?? ""}". Use: validate | golden | hash | compute\n`);
      return 2;
  }
}

function cmdValidate(rulesDir: string): number {
  const load = loadStateDir(rulesDir);
  const issues = validateRuleSet(load.ruleSet);
  for (const p of load.parseErrors) process.stderr.write(`PARSE ERROR ${p.file}: ${p.message}\n`);
  for (const i of issues) process.stderr.write(`${i.level.toUpperCase()} [${i.where}] ${i.message}\n`);
  const errors = load.parseErrors.length + issues.filter((i) => i.level === "error").length;
  process.stdout.write(`validate: ${errors} error(s), ${issues.filter((i) => i.level === "warning").length} warning(s)\n`);
  return errors === 0 ? 0 : 1;
}

function cmdGolden(rulesDir: string, goldenDir: string): number {
  const { ruleSet, parseErrors } = loadStateDir(rulesDir);
  for (const p of parseErrors) process.stderr.write(`PARSE ERROR ${p.file}: ${p.message}\n`);
  const cases = loadGoldenDir(goldenDir);
  let failed = 0;
  for (const c of cases) {
    const r = runCase(ruleSet, c);
    if (!r.pass) {
      failed++;
      process.stderr.write(`FAIL ${r.name}\n`);
      for (const f of r.failures) process.stderr.write(`   - ${f}\n`);
    }
  }
  process.stdout.write(`golden: ${cases.length - failed}/${cases.length} passed\n`);
  return failed === 0 && parseErrors.length === 0 ? 0 : 1;
}

function cmdHash(rulesDir: string, state: Jurisdiction, date: string): number {
  const { ruleSet } = loadStateDir(rulesDir);
  const snapshot = buildSnapshot(ruleSet, state, date);
  process.stdout.write(`${snapshot.hash}\n`);
  return 0;
}

function cmdCompute(rulesDir: string, inputFile: string): number {
  const { ruleSet } = loadStateDir(rulesDir);
  const input = JSON.parse(readFileSync(inputFile, "utf8")) as ComputeInput;
  const out = compute(ruleSet, input);
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  return 0;
}

function parseFlags(rest: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = rest[i + 1];
      if (val === undefined || val.startsWith("--")) {
        out[key] = "true";
      } else {
        out[key] = val;
        i++;
      }
    }
  }
  return out;
}

function req(args: Record<string, string>, key: string): string {
  const v = args[key];
  if (v === undefined) {
    process.stderr.write(`missing required flag --${key}\n`);
    process.exit(2);
  }
  return v;
}

process.exit(main(process.argv.slice(2)));
