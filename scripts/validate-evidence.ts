/**
 * Evidence-link gate and deterministic coverage report.
 *
 * Missing links remain valid draft data and are reported as coverage gaps.
 * Any supplied link must resolve exactly against the committed Watchdog
 * document/sweep/event catalog and an accepted source, or this command fails.
 */
import { createHash } from "node:crypto";
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
import {
  verifyBlobCollection,
  WATCHDOG_BLOB_COLLECTIONS,
  type BlobVerificationReport,
} from "../packages/watchdog/src/integrity.js";
import { renderPromotionReport } from "../packages/watchdog/src/promotion.js";
import {
  buildMaharashtraTriageReport,
  renderMaharashtraReviewQueue,
  renderMaharashtraTriageReport,
  type MaharashtraCandidateDispositionLedger,
  type MaharashtraContentExtractionReceipt,
  type MaharashtraTriageSourceInput,
} from "../packages/watchdog/src/triage.js";
import type { DocumentRecord } from "../packages/watchdog/src/types.js";

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
const PROMOTION_REPORT_PATH = "WATCHDOG-PROMOTION-REPORT.json";
const MH_TRIAGE_REPORT_PATH = "WATCHDOG-MH-EVIDENCE-CANDIDATES.json";
const MH_CONTENT_RECEIPT_PATH = "WATCHDOG-MH-CONTENT-EXTRACTION.json";
const MH_REVIEW_QUEUE_PATH = "WATCHDOG-MH-REVIEW-QUEUE.md";
const MH_CANDIDATE_DISPOSITIONS_PATH = "WATCHDOG-MH-CANDIDATE-DISPOSITIONS.json";

const load = mergeLoads(STATES.map((state) => loadStateDir(`rules/${state}`)));
if (load.parseErrors.length > 0) {
  for (const error of load.parseErrors) {
    process.stderr.write(`ERROR evidence corpus parse ${error.file}: ${error.message}\n`);
  }
  process.exit(1);
}

const catalog = loadEvidenceCatalog("watchdog-data");
const blobReports = await Promise.all(
  WATCHDOG_BLOB_COLLECTIONS.map((collection) =>
    verifyBlobCollection(collection, { requireBodies: process.argv.includes("--require-blobs") })
  ),
);
const dependencies = collectCorpusEvidenceDependencies(load.ruleSet, load.trees);
const coverage = evidenceCoverage(dependencies, catalog);
const report = renderReport(coverage, catalog, blobReports);
const promotionReport = renderPromotionReport(catalog.promotions);
const mhTriage = buildMaharashtraTriageReport(
    loadMaharashtraTriageInputs(),
    loadMaharashtraContentReceipt(),
    { sweeps: catalog.sweeps, events: catalog.events },
    loadMaharashtraCandidateDispositions(),
);
const mhTriageReport = renderMaharashtraTriageReport(mhTriage);
const mhReviewQueue = renderMaharashtraReviewQueue(mhTriage);

for (const entry of coverage.entries.filter((candidate) => candidate.issues.length > 0)) {
  for (const issue of entry.issues) {
    process.stderr.write(`ERROR evidence ${entry.label}: ${issue}\n`);
  }
}

let reportMismatch = false;
if (process.argv.includes("--print-promotion-report")) {
  process.stdout.write(promotionReport);
} else if (process.argv.includes("--print-mh-triage-report")) {
  process.stdout.write(mhTriageReport);
} else if (process.argv.includes("--print-mh-review-queue")) {
  process.stdout.write(mhReviewQueue);
} else if (process.argv.includes("--print-report")) {
  process.stdout.write(report);
} else {
  process.stdout.write(
    `evidence: ${coverage.linked}/${coverage.total} linked, ${coverage.missing} missing, ${coverage.invalid} invalid; ` +
      `${catalog.documents.length} catalog document(s), ${catalog.sweeps.length} sweep(s); ` +
      `blobs ${blobReports.map((candidate) => `${candidate.source_id}=${candidate.status}`).join(", ")}\n`,
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
  const currentPromotion = existsSync(PROMOTION_REPORT_PATH) ? readFileSync(PROMOTION_REPORT_PATH, "utf8") : "";
  if (currentPromotion !== promotionReport) {
    reportMismatch = true;
    process.stderr.write(
      `ERROR Watchdog promotion report is stale: run "node_modules/.bin/tsx scripts/validate-evidence.ts --print-promotion-report" and update ${PROMOTION_REPORT_PATH}\n`,
    );
  }
  const currentMhTriage = existsSync(MH_TRIAGE_REPORT_PATH) ? readFileSync(MH_TRIAGE_REPORT_PATH, "utf8") : "";
  if (currentMhTriage !== mhTriageReport) {
    reportMismatch = true;
    process.stderr.write(
      `ERROR Maharashtra evidence candidate report is stale: run "node_modules/.bin/tsx scripts/validate-evidence.ts --print-mh-triage-report" and update ${MH_TRIAGE_REPORT_PATH}\n`,
    );
  }
  const currentMhReviewQueue = existsSync(MH_REVIEW_QUEUE_PATH) ? readFileSync(MH_REVIEW_QUEUE_PATH, "utf8") : "";
  if (currentMhReviewQueue !== mhReviewQueue) {
    reportMismatch = true;
    process.stderr.write(
      `ERROR Maharashtra review queue is stale: run "node_modules/.bin/tsx scripts/validate-evidence.ts --print-mh-review-queue" and update ${MH_REVIEW_QUEUE_PATH}\n`,
    );
  }
}

process.exit(coverage.invalid === 0 && !reportMismatch ? 0 : 1);

function loadMaharashtraTriageInputs(): MaharashtraTriageSourceInput[] {
  const configs = [
    {
      sourceId: "mh-egazette-part8",
      occurrenceSourceIds: ["mh-egazette"],
      indexPath: "watchdog-data/index/documents.jsonl",
      manifestPath: "watchdog-data/state/blob-manifest.json",
      blobRoot: "watchdog-data/blobs",
    },
    {
      sourceId: "mh-egazette-part4b",
      occurrenceSourceIds: ["mh-egazette-part4b"],
      indexPath: "watchdog-data/sources/mh-egazette-part4b/index/documents.jsonl",
      manifestPath: "watchdog-data/sources/mh-egazette-part4b/state/blob-manifest.json",
      blobRoot: "watchdog-data/sources/mh-egazette-part4b/blobs",
    },
  ] as const;
  return configs.map((config) => {
    const promotion = catalog.promotions.find((candidate) => candidate.source_id === config.sourceId);
    if (!promotion?.requested) throw new Error(`Missing Maharashtra promotion requirement: ${config.sourceId}`);
    const indexBody = readFileSync(config.indexPath);
    const manifestBody = readFileSync(config.manifestPath);
    const documents = indexBody.toString("utf8").split("\n").filter(Boolean).map((line) =>
      JSON.parse(line) as DocumentRecord
    );
    return {
      source_id: config.sourceId,
      occurrence_source_ids: [...config.occurrenceSourceIds],
      index_path: config.indexPath,
      index_sha256: createHash("sha256").update(indexBody).digest("hex"),
      manifest_path: config.manifestPath,
      manifest_sha256: createHash("sha256").update(manifestBody).digest("hex"),
      blob_root: config.blobRoot,
      accepted: promotion.status === "accepted",
      range_from: promotion.requested.range_from,
      range_to: promotion.requested.range_to,
      documents,
    };
  });
}

function loadMaharashtraContentReceipt() {
  const body = readFileSync(MH_CONTENT_RECEIPT_PATH);
  return {
    receipt_path: MH_CONTENT_RECEIPT_PATH,
    receipt_sha256: createHash("sha256").update(body).digest("hex"),
    receipt: JSON.parse(body.toString("utf8")) as MaharashtraContentExtractionReceipt,
  };
}

function loadMaharashtraCandidateDispositions() {
  const body = readFileSync(MH_CANDIDATE_DISPOSITIONS_PATH);
  return {
    ledger_path: MH_CANDIDATE_DISPOSITIONS_PATH,
    ledger_sha256: createHash("sha256").update(body).digest("hex"),
    ledger: JSON.parse(body.toString("utf8")) as MaharashtraCandidateDispositionLedger,
  };
}

function renderReport(
  coverage: EvidenceCoverage,
  catalog: WatchdogEvidenceCatalog,
  blobReports: readonly BlobVerificationReport[],
): string {
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
    `- Blob manifest coverage: **${blobReports.length} source families**, **${blobReports.reduce((total, report) => total + report.unique_blobs, 0)} unique blobs**`,
    "- Off-device restore: **NOT CONFIGURED — RELEASE BLOCKER**",
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
    "Both Maharashtra source families pass their exact-range machine-generated promotion baselines. Separate receipt-bound backfill contracts prove complete Part 8 query coverage from the 2015 product floor through 2025-04-08 and complete Part IV-B yearly queries for 2015 through 2020. The early-2021 Part IV-B query archived 207 of 208 listed documents; the exact inaccessible 2021-05-28 row remains recorded as a document gap. The numeric calculator corpus also depends on a consolidated Act/Schedule spine, complete amendment and commencement chains, and official municipal, concession, and IGR source families that are not yet established. Therefore no citation has been linked merely because a keyword candidate is archived; that would be false provenance.",
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
