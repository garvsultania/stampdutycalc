/**
 * Evidence-link gate and deterministic coverage report.
 *
 * Missing links remain valid draft data and are reported as coverage gaps.
 * Any supplied link must resolve exactly against the committed Watchdog
 * document/sweep/event catalog and an accepted source, or this command fails.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  collectCorpusEvidenceDependencies,
  evidenceCoverage,
  loadStateDir,
  mergeLoads,
  type CorpusEvidenceKind,
  type EvidenceCoverage,
} from "@stampdraft/engine";
import { loadEvidenceCatalog, type WatchdogEvidenceCatalog } from "../packages/watchdog/src/catalog.js";

const STATES = ["DL", "MH", "KA"] as const;
const KINDS: CorpusEvidenceKind[] = [
  "rule",
  "modifier",
  "penalty",
  "charging_version",
  "charging_section",
  "classification",
];
const REPORT_PATH = "EVIDENCE-COVERAGE.md";

const load = mergeLoads(STATES.map((state) => loadStateDir(`rules/${state}`)));
if (load.parseErrors.length > 0) {
  for (const error of load.parseErrors) {
    process.stderr.write(`ERROR evidence corpus parse ${error.file}: ${error.message}\n`);
  }
  process.exit(1);
}

const catalog = loadEvidenceCatalog("watchdog-data");
const dependencies = collectCorpusEvidenceDependencies(load.ruleSet, load.trees);
const coverage = evidenceCoverage(dependencies, catalog);
const report = renderReport(coverage, catalog);

for (const entry of coverage.entries.filter((candidate) => candidate.issues.length > 0)) {
  for (const issue of entry.issues) {
    process.stderr.write(`ERROR evidence ${entry.label}: ${issue}\n`);
  }
}

let reportMismatch = false;
if (process.argv.includes("--print-report")) {
  process.stdout.write(report);
} else {
  process.stdout.write(
    `evidence: ${coverage.linked}/${coverage.total} linked, ${coverage.missing} missing, ${coverage.invalid} invalid; ` +
      `${catalog.documents.length} catalog document(s), ${catalog.sweeps.length} sweep(s)\n`,
  );
}

if (process.argv.includes("--check-report")) {
  const current = existsSync(REPORT_PATH) ? readFileSync(REPORT_PATH, "utf8") : "";
  if (current !== report) {
    reportMismatch = true;
    process.stderr.write(
      `ERROR evidence coverage report is stale: run "node_modules/.bin/tsx scripts/validate-evidence.ts --print-report" and update ${REPORT_PATH}\n`,
    );
  }
}

process.exit(coverage.invalid === 0 && !reportMismatch ? 0 : 1);

function renderReport(coverage: EvidenceCoverage, catalog: WatchdogEvidenceCatalog): string {
  const accepted = catalog.sources.filter((source) => source.status === "accepted");
  const lines = [
    "# Watchdog Evidence Coverage",
    "",
    "This file is generated deterministically from the calculator corpus and the committed Watchdog catalog. Missing links are permitted for draft encoding but are hard production refusals. Supplied links must pass catalog validation.",
    "",
    "## Current result",
    "",
    `- Citation dependencies: **${coverage.total}**`,
    `- Watchdog-linked: **${coverage.linked}**`,
    `- Missing links: **${coverage.missing}**`,
    `- Invalid supplied links: **${coverage.invalid}**`,
    `- Catalog records: **${catalog.documents.length} documents**, **${catalog.sweeps.length} sweeps**, **${catalog.events.length} events**`,
    `- Accepted source families: **${accepted.length}** (${accepted.map((source) => source.id).join(", ") || "none"})`,
    "",
    "Production remains closed for every dependency without a valid link and for any link whose amendment or commencement audit is stale at the application-supplied evidence date.",
    "",
    "## Coverage by jurisdiction and dependency",
    "",
    "| Jurisdiction | Dependency | Total | Linked | Missing | Invalid |",
    "|---|---:|---:|---:|---:|---:|",
  ];

  for (const jurisdiction of STATES) {
    for (const kind of KINDS) {
      const entries = coverage.entries.filter(
        (entry) => entry.jurisdiction === jurisdiction && entry.kind === kind,
      );
      if (entries.length === 0) continue;
      lines.push(
        `| ${jurisdiction} | ${kind.replaceAll("_", " ")} | ${entries.length} | ` +
          `${entries.filter((entry) => entry.linked).length} | ` +
          `${entries.filter((entry) => !entry.supplied).length} | ` +
          `${entries.filter((entry) => entry.issues.length > 0).length} |`,
      );
    }
  }

  lines.push(
    "",
    "## Interpretation",
    "",
    "The catalog contains Maharashtra Part 8 publications from 2025-04-09 through 2026-07-16 and Part IV-B notifications from 2021-07-17 through 2026-07-19. Only Part IV-B currently passes the machine-generated repeat-run promotion gate; Part 8 still needs a second complete identical run. The numeric calculator corpus also depends on older consolidated Acts, amendment baselines, and other source families that are not yet present. Therefore no citation has been linked merely because a later Act or notification is available; those would be false provenance links.",
    "",
    "A dependency becomes linked only when its citation records the exact immutable document hash, source row, acquisition run, precise locator, complete amendment and commencement source families, successful audit run(s), checked interval, and human evidence review.",
    "",
  );

  if (coverage.invalid > 0) {
    lines.push("## Invalid supplied links", "");
    for (const entry of coverage.entries.filter((candidate) => candidate.issues.length > 0)) {
      lines.push(`- ${entry.label}: ${entry.issues.join("; ")}`);
    }
    lines.push("");
  }
  // `lines` deliberately ends with an empty entry, so join already supplies the
  // single POSIX final newline. Adding another here makes the checked artifact
  // differ only by an invisible extra blank line.
  return lines.join("\n");
}
