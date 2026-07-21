import {
  CitationSchema,
  ISODateSchema,
  type Citation,
  type CitationEvidence,
  type EvidenceAuditRef,
  type EvidenceDocumentRef,
} from "@stampdraft/schema";
import { citationEvidenceIssues, type EvidenceCatalog } from "./evidence.js";

export interface ProposedEvidenceChain {
  checked_from: string;
  checked_through: string;
  source_ids: string[];
  documents: string[];
}

export interface ProposedCitationEvidence {
  documents: EvidenceDocumentRef[];
  audits: EvidenceAuditRef[];
  amendment_chain: ProposedEvidenceChain;
  commencement_chain: ProposedEvidenceChain;
}

export interface EvidenceLinkProposal {
  schema_version: 1;
  target: {
    jurisdiction: string;
    kind:
      | "rule"
      | "modifier"
      | "penalty"
      | "charging_version"
      | "charging_section"
      | "classification";
    id: string;
    effective_from: string;
    section?: "4" | "5" | "6";
    citation_ref: string;
  };
  evidence_as_of: string;
  proposed_evidence: ProposedCitationEvidence;
  source_text_receipts: Array<{
    sha256: string;
    pages: number[];
    text_sha256: string;
    detail: string;
  }>;
  review_context: {
    encoded_diff: {
      base_revision: string;
      candidate_revision: string;
      changed_paths: string[];
      summary: string;
    };
    tests: {
      present_day: string[];
      boundaries: string[];
      negative_cases: string[];
    };
    canary: {
      id: string | null;
      status: "passed" | "not_applicable" | "not_run" | "unexplained_divergence";
      detail: string;
    };
    open_refusals: string[];
  };
  human_review: {
    status: "pending_human_review";
    questions: string[];
  };
}

export interface EvidenceLinkProposalAssessment {
  mechanically_valid: boolean;
  issues: string[];
}

/** Validate every machine-checkable portion of a proposed evidence link without
 * manufacturing the human evidence-review fields required by CitationEvidence.
 * The temporary reviewer value exists only in memory for schema validation and
 * is never returned or written to the corpus. */
export function assessEvidenceLinkProposal(
  proposal: EvidenceLinkProposal,
  citation: Citation,
  catalog: EvidenceCatalog,
): EvidenceLinkProposalAssessment {
  const issues: string[] = [];
  let asOf: string;
  try {
    asOf = ISODateSchema.parse(proposal.evidence_as_of);
  } catch (error) {
    return { mechanically_valid: false, issues: [`invalid evidence_as_of: ${errorMessage(error)}`] };
  }

  if (proposal.schema_version !== 1) issues.push("unsupported proposal schema version");
  if (proposal.target.citation_ref !== citation.ref) {
    issues.push(`target citation is ${proposal.target.citation_ref}, not ${citation.ref}`);
  }
  if (proposal.target.kind === "charging_section" && proposal.target.section === undefined) {
    issues.push("charging-section proposal has no section");
  }
  if (proposal.target.kind !== "charging_section" && proposal.target.section !== undefined) {
    issues.push("only a charging-section proposal may specify section");
  }
  if (citation.evidence !== undefined) issues.push("target citation already has an evidence link");
  if (proposal.human_review.status !== "pending_human_review") {
    issues.push("proposal must remain pending human review");
  }
  if (proposal.review_context.encoded_diff.changed_paths.length === 0) {
    issues.push("encoded diff has no changed paths");
  }
  for (const [name, receipts] of Object.entries(proposal.review_context.tests)) {
    if (receipts.length === 0) issues.push(`${name} has no test receipt`);
  }
  if (proposal.review_context.canary.status === "not_run") issues.push("canary has not been run");
  if (proposal.review_context.canary.status === "unexplained_divergence") {
    issues.push("canary has an unexplained divergence");
  }
  for (const [name, chain] of [
    ["amendment", proposal.proposed_evidence.amendment_chain],
    ["commencement", proposal.proposed_evidence.commencement_chain],
  ] as const) {
    if (chain.checked_from !== proposal.target.effective_from) {
      issues.push(
        `${name} chain starts ${chain.checked_from}, not target effective date ${proposal.target.effective_from}`,
      );
    }
    if (chain.checked_through < asOf) {
      issues.push(`${name} chain is checked only through ${chain.checked_through}`);
    }
  }
  const receiptHashes = new Set(proposal.source_text_receipts.map((receipt) => receipt.sha256));
  for (const document of proposal.proposed_evidence.documents) {
    if (!receiptHashes.has(document.sha256)) {
      issues.push(`document ${document.sha256} has no source-text receipt`);
    }
  }

  try {
    const proposedEvidence: CitationEvidence = {
      ...proposal.proposed_evidence,
      reviewed_by: "PENDING-HUMAN-REVIEW-VALIDATION-ONLY",
      reviewed_on: asOf,
    };
    const proposedCitation = CitationSchema.parse({ ...citation, evidence: proposedEvidence });
    issues.push(...citationEvidenceIssues(proposedCitation, catalog));
  } catch (error) {
    issues.push(`proposed evidence shape is invalid: ${errorMessage(error)}`);
  }

  return { mechanically_valid: issues.length === 0, issues };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
