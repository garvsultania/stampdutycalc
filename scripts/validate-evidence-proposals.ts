import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  assessEvidenceLinkProposal,
  collectCorpusEvidenceDependencies,
  evidenceCoverage,
  loadStateDir,
  mergeLoads,
  type EvidenceLinkProposal,
} from "@stampdraft/engine";
import type { Citation } from "@stampdraft/schema";
import { loadEvidenceCatalog } from "../packages/watchdog/src/catalog.js";

const REPORT_PATH = "EVIDENCE-LINK-PROPOSALS.md";
const PACKAGE_PATH = "EVIDENCE-REVIEW-PACKAGE.json";
const PACKET_DIR = "review-packets";
const STATES = ["DL", "MH", "KA"] as const;

const load = mergeLoads(STATES.map((state) => loadStateDir(`rules/${state}`)));
if (load.parseErrors.length > 0) {
  for (const error of load.parseErrors) process.stderr.write(`ERROR ${error.file}: ${error.message}\n`);
  process.exit(1);
}
const catalog = loadEvidenceCatalog("watchdog-data");
const corpusCoverage = evidenceCoverage(
  collectCorpusEvidenceDependencies(load.ruleSet, load.trees),
  catalog,
);
const packets = readdirSync(PACKET_DIR)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .flatMap((file) => {
    const path = `${PACKET_DIR}/${file}`;
    const body = readFileSync(path);
    const parsed = JSON.parse(body.toString("utf8")) as EvidenceLinkProposal | EvidenceLinkProposal[];
    const proposals = Array.isArray(parsed) ? parsed : [parsed];
    return proposals.map((proposal, index) => ({
      file: proposals.length === 1 ? path : `${path}#${index + 1}`,
      packet_path: path,
      packet_sha256: createHash("sha256").update(body).digest("hex"),
      proposal,
    }));
  });

const rows = packets.map(({ file, packet_path, packet_sha256, proposal }) => {
  const target = resolveCitation(proposal);
  const assessment = target
    ? assessEvidenceLinkProposal(proposal, target, catalog)
    : { mechanically_valid: false, issues: ["target dependency was not found in the corpus"] };
  return { file, packet_path, packet_sha256, proposal, assessment };
});
const report = render(rows, corpusCoverage.linked, corpusCoverage.total);
const reviewPackage = renderPackage(rows, corpusCoverage.linked, corpusCoverage.total);

if (process.argv.includes("--print-report")) process.stdout.write(report);
else if (process.argv.includes("--print-package")) process.stdout.write(reviewPackage);
else {
  process.stdout.write(
    `evidence proposals: ${rows.filter((row) => row.assessment.mechanically_valid).length}/${rows.length} mechanically valid; ` +
      `${rows.filter((row) => row.proposal.human_review.status === "pending_human_review").length} pending human review\n`,
  );
}

let stale = false;
if (process.argv.includes("--check-report")) {
  const current = existsSync(REPORT_PATH) ? readFileSync(REPORT_PATH, "utf8") : "";
  if (current !== report) {
    stale = true;
    process.stderr.write(
      `ERROR evidence proposal report is stale: run ` +
        `"node_modules/.bin/tsx scripts/validate-evidence-proposals.ts --print-report" and update ${REPORT_PATH}\n`,
    );
  }
  const currentPackage = existsSync(PACKAGE_PATH) ? readFileSync(PACKAGE_PATH, "utf8") : "";
  if (currentPackage !== reviewPackage) {
    stale = true;
    process.stderr.write(
      `ERROR evidence review package is stale: run ` +
        `"node_modules/.bin/tsx scripts/validate-evidence-proposals.ts --print-package" and update ${PACKAGE_PATH}\n`,
    );
  }
}
for (const row of rows.filter((candidate) => !candidate.assessment.mechanically_valid)) {
  process.stderr.write(`ERROR ${row.file}: ${row.assessment.issues.join("; ")}\n`);
}
process.exit(rows.every((row) => row.assessment.mechanically_valid) && !stale ? 0 : 1);

function resolveCitation(proposal: EvidenceLinkProposal): Citation | undefined {
  const { kind, id, effective_from } = proposal.target;
  if (kind === "rule") {
    return load.ruleSet.rules.find(
      (candidate) => candidate.rule_id === id && candidate.version.effective_from === effective_from,
    )?.version.source;
  }
  if (kind === "modifier") {
    return load.ruleSet.modifiers.find(
      (candidate) => candidate.modifier_id === id && candidate.version.effective_from === effective_from,
    )?.version.source;
  }
  if (kind === "classification") {
    return load.trees.find(
      (candidate) => candidate.tree_id === id && candidate.version.effective_from === effective_from,
    )?.version.source;
  }
  if (kind === "charging_version" || kind === "charging_section") {
    const charging = load.ruleSet.chargingRules?.find(
      (candidate) => candidate.rules_id === id && candidate.version.effective_from === effective_from,
    );
    if (!charging) return undefined;
    if (kind === "charging_version") return charging.version.source;
    return proposal.target.section === "4"
      ? charging.s4.source
      : proposal.target.section === "5"
        ? charging.s5.source
        : proposal.target.section === "6"
          ? charging.s6.source
          : undefined;
  }
  return load.ruleSet.penaltyRegimes.find(
    (candidate) => candidate.regime_id === id && candidate.version.effective_from === effective_from,
  )?.version.source;
}

function render(rows: typeof packets extends Array<unknown> ? Array<{
  file: string;
  packet_path: string;
  packet_sha256: string;
  proposal: EvidenceLinkProposal;
  assessment: { mechanically_valid: boolean; issues: string[] };
}> : never, linked: number, total: number): string {
  const valid = rows.filter((row) => row.assessment.mechanically_valid).length;
  const lines = [
    "# Prepared Evidence-Link Proposals",
    "",
    "This deterministic ledger covers evidence work completed before human legal/founder review. A mechanically valid proposal is not a production evidence link and does not populate `reviewed_by`, `reviewed_on`, `verified_by`, or `verified_on`.",
    "",
    "## Current result",
    "",
    `- Mechanically valid proposals: **${valid}/${rows.length}**`,
    `- Pending human review: **${rows.filter((row) => row.proposal.human_review.status === "pending_human_review").length}**`,
    "- Promoted into corpus evidence: **0**",
    `- Current corpus evidence coverage remains **${linked}/${total}** until reviewed proposals are deliberately promoted.`,
    `- Tamper-evident package manifest: \`${PACKAGE_PATH}\``,
    "",
    "| Dependency | Evidence through | Documents | Tests | Status |",
    "|---|---:|---:|---:|---|",
  ];
  for (const row of rows) {
    const tests = Object.values(row.proposal.review_context.tests).reduce((sum, receipts) => sum + receipts.length, 0);
    lines.push(
      `| ${targetLabel(row.proposal)} | ` +
        `${row.proposal.evidence_as_of} | ${row.proposal.proposed_evidence.documents.length} | ${tests} | ` +
        `${row.assessment.mechanically_valid ? "mechanically valid; human review pending" : "invalid"} |`,
    );
  }
  for (const row of rows) {
    lines.push(
      "",
      `## ${row.proposal.target.id}@${row.proposal.target.effective_from}`,
      "",
      `- Packet: \`${row.file}\``,
      `- Citation: ${row.proposal.target.citation_ref}`,
      `- Amendment chain: ${row.proposal.proposed_evidence.amendment_chain.checked_from} through ${row.proposal.proposed_evidence.amendment_chain.checked_through}`,
      `- Commencement chain: ${row.proposal.proposed_evidence.commencement_chain.checked_from} through ${row.proposal.proposed_evidence.commencement_chain.checked_through}`,
      `- Source families: ${row.proposal.proposed_evidence.amendment_chain.source_ids.join(", ")}`,
      `- Open refusals retained: ${row.proposal.review_context.open_refusals.length}`,
      "- Human review questions:",
      ...row.proposal.human_review.questions.map((question) => `  - ${question}`),
    );
    if (row.assessment.issues.length > 0) {
      lines.push("- Mechanical issues:", ...row.assessment.issues.map((issue) => `  - ${issue}`));
    }
  }
  lines.push("");
  return lines.join("\n");
}

function targetLabel(proposal: EvidenceLinkProposal): string {
  const section = proposal.target.section ? ` s.${proposal.target.section}` : "";
  return `${proposal.target.kind} ${proposal.target.id}${section}@${proposal.target.effective_from}`;
}

function renderPackage(rows: Array<{
  file: string;
  packet_path: string;
  packet_sha256: string;
  proposal: EvidenceLinkProposal;
  assessment: { mechanically_valid: boolean; issues: string[] };
}>, linked: number, total: number): string {
  return `${JSON.stringify({
    schema_version: 1,
    purpose: "Tamper-evident pre-approval evidence-review handoff; not a production evidence link",
    corpus_evidence_coverage: { linked, total },
    approval_metadata_populated: false,
    proposals: rows.map(({ packet_path, packet_sha256, proposal, assessment }) => ({
      packet_path,
      packet_sha256,
      target: {
        kind: proposal.target.kind,
        id: proposal.target.id,
        effective_from: proposal.target.effective_from,
      },
      evidence_as_of: proposal.evidence_as_of,
      document_sha256s: proposal.proposed_evidence.documents.map((document) => document.sha256),
      source_text_sha256s: proposal.source_text_receipts.map((receipt) => receipt.text_sha256),
      golden_receipt_count: Object.values(proposal.review_context.tests).flat().length,
      canary_status: proposal.review_context.canary.status,
      open_refusal_count: proposal.review_context.open_refusals.length,
      mechanically_valid: assessment.mechanically_valid,
      mechanical_issues: assessment.issues,
      human_review_status: proposal.human_review.status,
    })),
  }, null, 2)}\n`;
}
