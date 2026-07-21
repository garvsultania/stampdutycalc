import {
  ISODateSchema,
  type EvidenceAuditRef,
  type EvidenceDocumentRef,
} from "@stampdraft/schema";
import { citationEvidenceIssues, type EvidenceCatalog } from "./evidence.js";
import type { ComputationDependencyTrace, ComputeTraceResult } from "./compute.js";

export type CanaryStatus = "passed" | "not_applicable" | "not_run" | "unexplained_divergence";

export interface ReleaseCandidateTestReceipts {
  present_day: string[];
  boundaries: string[];
  negative_cases: string[];
}

export interface ReleaseCandidateDiffReceipt {
  base_revision: string;
  candidate_revision: string;
  changed_paths: string[];
  summary: string;
}

export interface ReleaseCandidateReviewContext {
  encoded_diff: ReleaseCandidateDiffReceipt;
  tests: ReleaseCandidateTestReceipts;
  open_refusals: string[];
  canary: {
    id: string | null;
    status: CanaryStatus;
    detail: string;
  };
}

export interface ReleaseCandidateDependency {
  kind: ComputationDependencyTrace["kind"];
  id: string;
  effective_from: string;
  effective_to: string | null;
  citation_ref: string;
  document_hashes: string[];
  evidence_documents: EvidenceDocumentRef[];
  evidence_audits: EvidenceAuditRef[];
  amendment_chain: {
    checked_from: string;
    checked_through: string;
    source_ids: string[];
    documents: string[];
  } | null;
  commencement_chain: {
    checked_from: string;
    checked_through: string;
    source_ids: string[];
    documents: string[];
  } | null;
  evidence_reviewed_by: string | null;
  evidence_reviewed_on: string | null;
  evidence_issues: string[];
  founder_verified: boolean;
  verified_by: string | null;
  verified_on: string | null;
}

export interface ComputationReleaseCandidate {
  schema_version: 1;
  rules_version: string;
  jurisdiction: string;
  rule_id: string;
  execution_date: string;
  evidence_as_of: string;
  review_ready: boolean;
  production_ready: boolean;
  review_blockers: string[];
  production_blockers: string[];
  dependencies: ReleaseCandidateDependency[];
  warnings: string[];
  review_context: ReleaseCandidateReviewContext;
}

export type FounderReviewDisposition =
  | "blocked_before_founder_review"
  | "ready_for_founder_review"
  | "production_ready";

export interface FounderReviewPacket {
  schema_version: 1;
  disposition: FounderReviewDisposition;
  candidate: ComputationReleaseCandidate;
  allowed_actions: Array<"approve_and_merge" | "request_correction" | "leave_refused">;
  verification_boundary: string;
}

/** Build an input-specific Phase 6 review gate from a completed computation.
 * Review readiness requires current, catalog-valid evidence plus test/refusal/
 * canary receipts. Production additionally requires founder verification. */
export function assessComputationReleaseCandidate(
  traced: ComputeTraceResult,
  catalog: EvidenceCatalog,
  evidenceAsOf: string,
  reviewContext: ReleaseCandidateReviewContext,
): ComputationReleaseCandidate {
  const asOf = ISODateSchema.parse(evidenceAsOf);
  const dependencies = traced.dependencies.map((dependency) => assessDependency(dependency, catalog));
  const reviewBlockers: string[] = [];
  const productionBlockers: string[] = [];

  if (
    reviewContext.encoded_diff.base_revision.trim().length === 0 ||
    reviewContext.encoded_diff.candidate_revision.trim().length === 0 ||
    reviewContext.encoded_diff.changed_paths.length === 0 ||
    reviewContext.encoded_diff.summary.trim().length === 0
  ) {
    reviewBlockers.push("no complete encoded-diff receipt is attached");
  }
  if (reviewContext.tests.present_day.length === 0) {
    reviewBlockers.push("no present-day golden receipt is attached");
  }
  if (reviewContext.tests.boundaries.length === 0) {
    reviewBlockers.push("no boundary golden receipt is attached");
  }
  if (reviewContext.tests.negative_cases.length === 0) {
    reviewBlockers.push("no negative/refusal-neighbour receipt is attached");
  }
  if (reviewContext.canary.status === "not_run") {
    reviewBlockers.push(`canary ${reviewContext.canary.id ?? "(unspecified)"} has not been run`);
  } else if (reviewContext.canary.status === "unexplained_divergence") {
    reviewBlockers.push(`canary ${reviewContext.canary.id ?? "(unspecified)"} has an unexplained divergence`);
  }

  for (const dependency of dependencies) {
    for (const issue of dependency.evidence_issues) {
      reviewBlockers.push(`${dependency.kind} ${dependency.id}: ${issue}`);
    }
    if (
      dependency.amendment_chain !== null &&
      dependency.amendment_chain.checked_through < asOf
    ) {
      reviewBlockers.push(
        `${dependency.kind} ${dependency.id}: amendment chain is checked only through ${dependency.amendment_chain.checked_through}`,
      );
    }
    if (
      dependency.commencement_chain !== null &&
      dependency.commencement_chain.checked_through < asOf
    ) {
      reviewBlockers.push(
        `${dependency.kind} ${dependency.id}: commencement chain is checked only through ${dependency.commencement_chain.checked_through}`,
      );
    }
    if (!dependency.founder_verified) {
      productionBlockers.push(`${dependency.kind} ${dependency.id}: founder verification is pending`);
    }
  }

  const review_ready = reviewBlockers.length === 0;
  return {
    schema_version: 1,
    rules_version: traced.output.rules_version,
    jurisdiction: traced.output.jurisdiction,
    rule_id: traced.output.rule_id,
    execution_date: traced.output.execution_date,
    evidence_as_of: asOf,
    review_ready,
    production_ready: review_ready && productionBlockers.length === 0,
    review_blockers: reviewBlockers,
    production_blockers: productionBlockers,
    dependencies,
    warnings: [...traced.output.warnings],
    review_context: reviewContext,
  };
}

/** Freeze the complete, input-specific review surface without crossing the
 * founder-only verification boundary. A blocked candidate cannot be presented
 * as ready merely because the packet itself was generated. */
export function buildFounderReviewPacket(
  candidate: ComputationReleaseCandidate,
): FounderReviewPacket {
  const disposition: FounderReviewDisposition = candidate.production_ready
    ? "production_ready"
    : candidate.review_ready
      ? "ready_for_founder_review"
      : "blocked_before_founder_review";
  return {
    schema_version: 1,
    disposition,
    candidate,
    allowed_actions: ["approve_and_merge", "request_correction", "leave_refused"],
    verification_boundary:
      "Only the founder's approved merge may populate verified_by and verified_on; packet generation never does so.",
  };
}

function assessDependency(
  dependency: ComputationDependencyTrace,
  catalog: EvidenceCatalog,
): ReleaseCandidateDependency {
  const evidence = dependency.citation.evidence;
  return {
    kind: dependency.kind,
    id: dependency.id,
    effective_from: dependency.effective_from,
    effective_to: dependency.effective_to,
    citation_ref: dependency.citation.ref,
    document_hashes: evidence?.documents.map((document) => document.sha256) ?? [],
    evidence_documents: evidence?.documents.map((document) => ({ ...document, locator: { ...document.locator } })) ?? [],
    evidence_audits: evidence?.audits.map((audit) => ({ ...audit })) ?? [],
    amendment_chain: evidence ? { ...evidence.amendment_chain, source_ids: [...evidence.amendment_chain.source_ids], documents: [...evidence.amendment_chain.documents] } : null,
    commencement_chain: evidence ? { ...evidence.commencement_chain, source_ids: [...evidence.commencement_chain.source_ids], documents: [...evidence.commencement_chain.documents] } : null,
    evidence_reviewed_by: evidence?.reviewed_by ?? null,
    evidence_reviewed_on: evidence?.reviewed_on ?? null,
    evidence_issues: citationEvidenceIssues(dependency.citation, catalog),
    founder_verified: dependency.verified_by !== null && dependency.verified_on !== null,
    verified_by: dependency.verified_by,
    verified_on: dependency.verified_on,
  };
}
