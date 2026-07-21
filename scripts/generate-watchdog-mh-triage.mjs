import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { loadEvidenceCatalog } from "../packages/watchdog/dist/catalog.js";
import {
  buildMaharashtraTriageReport,
  renderMaharashtraReviewQueue,
  renderMaharashtraTriageReport,
} from "../packages/watchdog/dist/triage.js";

const OUTPUT_PATH = "WATCHDOG-MH-EVIDENCE-CANDIDATES.json";
const REVIEW_QUEUE_PATH = "WATCHDOG-MH-REVIEW-QUEUE.md";
const CONTENT_RECEIPT_PATH = "WATCHDOG-MH-CONTENT-EXTRACTION.json";
const CANDIDATE_DISPOSITIONS_PATH = "WATCHDOG-MH-CANDIDATE-DISPOSITIONS.json";
const catalog = loadEvidenceCatalog("watchdog-data");
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
];

const inputs = configs.map((config) => {
  const promotion = catalog.promotions.find((candidate) => candidate.source_id === config.sourceId);
  if (!promotion?.requested) throw new Error(`Missing Maharashtra promotion requirement: ${config.sourceId}`);
  const indexBody = readFileSync(config.indexPath);
  const manifestBody = readFileSync(config.manifestPath);
  return {
    source_id: config.sourceId,
    occurrence_source_ids: config.occurrenceSourceIds,
    index_path: config.indexPath,
    index_sha256: createHash("sha256").update(indexBody).digest("hex"),
    manifest_path: config.manifestPath,
    manifest_sha256: createHash("sha256").update(manifestBody).digest("hex"),
    blob_root: config.blobRoot,
    accepted: promotion.status === "accepted",
    range_from: promotion.requested.range_from,
    range_to: promotion.requested.range_to,
    documents: indexBody.toString("utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)),
  };
});

const contentReceiptBody = readFileSync(CONTENT_RECEIPT_PATH);
const candidateDispositionsBody = readFileSync(CANDIDATE_DISPOSITIONS_PATH);
const report = buildMaharashtraTriageReport(inputs, {
  receipt_path: CONTENT_RECEIPT_PATH,
  receipt_sha256: createHash("sha256").update(contentReceiptBody).digest("hex"),
  receipt: JSON.parse(contentReceiptBody.toString("utf8")),
}, {
  sweeps: catalog.sweeps,
  events: catalog.events,
}, {
  ledger_path: CANDIDATE_DISPOSITIONS_PATH,
  ledger_sha256: createHash("sha256").update(candidateDispositionsBody).digest("hex"),
  ledger: JSON.parse(candidateDispositionsBody.toString("utf8")),
});
writeFileSync(OUTPUT_PATH, renderMaharashtraTriageReport(report), { encoding: "utf8" });
writeFileSync(REVIEW_QUEUE_PATH, renderMaharashtraReviewQueue(report), { encoding: "utf8" });
process.stdout.write(
  `wrote ${OUTPUT_PATH}: ${report.totals.candidate_occurrences} candidate occurrence(s), ` +
    `${report.totals.candidate_blobs} candidate blob(s); ${REVIEW_QUEUE_PATH}\n`,
);
