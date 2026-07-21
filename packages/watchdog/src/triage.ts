import { createHash } from "node:crypto";
import { WatchdogError } from "./errors.js";
import type { DocumentRecord, SweepRun, WatchdogEvent } from "./types.js";

export type MaharashtraTriageCategory =
  | "stamp"
  | "registration"
  | "valuation"
  | "surcharge_cess"
  | "concession_remission"
  | "amendment"
  | "commencement";

export interface MaharashtraTriageSourceInput {
  source_id: string;
  occurrence_source_ids: string[];
  index_path: string;
  index_sha256: string;
  manifest_path: string;
  manifest_sha256: string;
  blob_root: string;
  accepted: boolean;
  range_from: string;
  range_to: string;
  documents: DocumentRecord[];
}

export interface MaharashtraHistoricalCoverageInput {
  sweeps: SweepRun[];
  events: WatchdogEvent[];
}

export interface MaharashtraHistoricalCoverageSegmentRequirement {
  range_from: string;
  range_to: string;
  rows: number;
  pages: number;
  archived_occurrences: number;
  missing_occurrences: Array<{
    source_row_id: string;
    gazette_date: string;
    title: string;
  }>;
}

export interface MaharashtraTriageTitleMatch {
  category: MaharashtraTriageCategory;
  terms: string[];
}

export interface MaharashtraTriageContentMatch extends MaharashtraTriageTitleMatch {
  pages: number[];
}

export interface MaharashtraContentExtractionReceipt {
  schema_version: 1;
  jurisdiction: "MH";
  extractor: {
    tool: string;
    version: string;
    text_method: string;
    normalization: string;
  };
  policy: {
    effect: "triage_only";
    citation_eligible: false;
    ocr_performed: false;
    scan_scope: "title_candidates_enacted_law_backstop_and_curated_dependency_targets";
    limitation: string;
  };
  taxonomy: Array<{
    category: MaharashtraTriageCategory;
    role: "domain" | "context";
    term_ids: string[];
  }>;
  sources: Array<{
    source_id: string;
    index_path: string;
    index_sha256: string;
    manifest_path: string;
    manifest_sha256: string;
    document_occurrences: number;
    archive_unique_blobs: number;
    selected_blobs: number;
  }>;
  summary: {
    archive_unique_blobs: number;
    selected_blobs: number;
    unscanned_blobs: number;
    status_blobs: Record<"text" | "empty" | "failed", number>;
    candidate_blobs: number;
    category_blobs: Record<MaharashtraTriageCategory, number>;
  };
  blobs: Array<{
    source_id: string;
    sha256: string;
    occurrences: Array<{ source_id: string; source_row_id: string }>;
    status: "text" | "empty" | "failed";
    pages: number;
    pages_with_text: number;
    text_characters: number;
    text_sha256: string | null;
    content_matches: MaharashtraTriageContentMatch[];
    error?: string;
  }>;
}

export interface MaharashtraTriageContentInput {
  receipt_path: string;
  receipt_sha256: string;
  receipt: MaharashtraContentExtractionReceipt;
}

export interface MaharashtraCandidateDispositionLedger {
  schema_version: 1;
  jurisdiction: "MH";
  policy: {
    effect: "engineering_scope_triage_only";
    citation_eligible: false;
    human_legal_review_required: true;
    product_scope: string;
    limitation: string;
  };
  entries: Array<{
    candidate_id: string;
    source_id: string;
    source_row_id: string;
    blob_sha256: string;
    text_sha256: string;
    status: "no_direct_current_calculator_dependency_identified";
    instrument_summary: string;
    engineering_rationale: string;
    revisit_if: string;
  }>;
}

export interface MaharashtraCandidateDispositionInput {
  ledger_path: string;
  ledger_sha256: string;
  ledger: MaharashtraCandidateDispositionLedger;
}

export interface MaharashtraTriageCandidate {
  candidate_id: string;
  source_id: string;
  occurrence_source_id: string;
  source_row_id: string;
  blob_sha256: string;
  gazette_date: string | null;
  title: string;
  publication_stage: "enacted_law" | "bill" | "notification_or_order" | "other";
  selection_specificity:
    | "direct_domain_term"
    | "generic_registration_term"
    | "enacted_law_backstop"
    | "curated_dependency_target";
  title_matches: MaharashtraTriageTitleMatch[];
  content_scan: {
    status: "not_scanned" | "text" | "empty" | "failed";
    pages: number;
    pages_with_text: number;
    text_characters: number;
    text_sha256: string | null;
    content_matches: MaharashtraTriageContentMatch[];
  };
  review_status: "unreviewed_candidate" | "engineering_triaged_human_review_required";
  engineering_disposition: MaharashtraCandidateDispositionLedger["entries"][number] | null;
  review_locator: {
    blob_path: string;
    keyword_pages: number[];
  };
  citation_eligible: false;
}

export interface MaharashtraTriageReport {
  schema_version: 1;
  jurisdiction: "MH";
  product_floor: "2015-01-01";
  policy: {
    selection_scope: "title_metadata_with_enacted_law_backstop_then_candidate_content";
    content_scan_status: "not_performed" | "selected_candidate_blobs_scanned";
    content_receipt: {
      path: string;
      sha256: string;
      extractor: string;
      extractor_version: string;
    } | null;
    candidate_dispositions: {
      path: string;
      sha256: string;
      entries: number;
      effect: "engineering_scope_triage_only";
      human_legal_review_required: true;
    } | null;
    candidate_effect: "triage_only";
    citation_eligible: false;
    limitation: string;
  };
  taxonomy: Array<{
    category: MaharashtraTriageCategory;
    role: "domain" | "context";
    terms: string[];
  }>;
  sources: Array<{
    source_id: string;
    accepted: true;
    index_path: string;
    index_sha256: string;
    manifest_path: string;
    manifest_sha256: string;
    requested_range: { from: string; to: string };
    observed_publication_dates: { from: string | null; to: string | null };
    document_occurrences: number;
    unique_blobs: number;
    candidate_occurrences: number;
    candidate_blobs: number;
    category_occurrences: Record<MaharashtraTriageCategory, number>;
    publication_stage_occurrences: Record<MaharashtraTriageCandidate["publication_stage"], number>;
    pre_acceptance_coverage: {
      range_from: string;
      range_to: string;
      status: "complete" | "one_document_gap" | "not_assessed";
      segments: Array<{
        range_from: string;
        range_to: string;
        status: "complete" | "one_document_gap";
        run_id: string;
        rows_listed: number;
        pages_fetched: number;
        pages_expected: number;
        archived_occurrences: number;
        acquisition_receipt_occurrences: number;
        missing_occurrences: Array<{
          source_row_id: string;
          gazette_date: string;
          title: string;
        }>;
      }>;
    };
  }>;
  totals: {
    document_occurrences: number;
    unique_blobs: number;
    candidate_occurrences: number;
    candidate_blobs: number;
    category_occurrences: Record<MaharashtraTriageCategory, number>;
    publication_stage_occurrences: Record<MaharashtraTriageCandidate["publication_stage"], number>;
    content_scan: {
      archive_unique_blobs: number;
      selected_blobs: number;
      unscanned_blobs: number;
      text_blobs: number;
      empty_blobs: number;
      failed_blobs: number;
      category_blobs: Record<MaharashtraTriageCategory, number>;
    } | null;
  };
  candidates: MaharashtraTriageCandidate[];
  missing_requirements: Array<{
    requirement_id: string;
    kind: "coverage_gap" | "document_gap" | "source_family" | "chain_audit";
    status: "unacquired" | "not_established";
    detail: string;
  }>;
}

interface TermDefinition {
  id: string;
  label: string;
  pattern: RegExp;
}

interface CategoryDefinition {
  category: MaharashtraTriageCategory;
  role: "domain" | "context";
  terms: TermDefinition[];
}

const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  {
    category: "stamp",
    role: "domain",
    terms: [
      { id: "stamp", label: "stamp/stamps", pattern: /\bstamps?\b/iu },
      { id: "mudrank_latin", label: "Mudrank", pattern: /\bmudrank\b/iu },
      { id: "mudrank_marathi", label: "मुद्रांक/मुद्राक", pattern: /मुद्रांक|मुद्राक/iu },
    ],
  },
  {
    category: "registration",
    role: "domain",
    terms: [
      { id: "registration", label: "registration/registrar", pattern: /\b(?:registration|registrar|sub[- ]registrar)\b/iu },
      { id: "nondani", label: "नोंदणी/निबंधक", pattern: /नोंदणी|दुय्यम निबंधक|निबंधक/iu },
    ],
  },
  {
    category: "valuation",
    role: "domain",
    terms: [
      {
        id: "valuation",
        label: "valuation/market value/ready reckoner/annual statement of rates",
        pattern: /\b(?:valuation|market value|ready reckoner|annual statement of rates)\b/iu,
      },
      { id: "mulyankan", label: "मूल्यांकन/बाजार मूल्य", pattern: /मूल्यांकन|बाजार ?मूल्य/iu },
    ],
  },
  {
    category: "surcharge_cess",
    role: "domain",
    terms: [
      { id: "surcharge_cess", label: "surcharge/cess", pattern: /\b(?:surcharge|cess)\b/iu },
      { id: "adhibhar_upkar", label: "अधिभार/उपकर", pattern: /अधिभार|उपकर/iu },
    ],
  },
  {
    category: "concession_remission",
    role: "domain",
    terms: [
      {
        id: "concession_remission",
        label: "concession/remission/exemption/reduction/rebate/waiver",
        pattern: /\b(?:concession|remission|exempt(?:ion|ed)?|reduction|rebate|waiver)\b/iu,
      },
      { id: "savalat_maphi", label: "सवलत/माफी/सूट", pattern: /सवलत|माफी|सूट/iu },
    ],
  },
  {
    category: "amendment",
    role: "context",
    terms: [
      { id: "amendment", label: "amend/amendment", pattern: /\bamend(?:ment|ed|ing)?\b/iu },
      { id: "sudharana", label: "सुधारणा/दुरुस्ती", pattern: /सुधारण|दुरुस्ती/iu },
    ],
  },
  {
    category: "commencement",
    role: "context",
    terms: [
      {
        id: "commencement",
        label: "commencement/come into force/effective from",
        pattern: /\b(?:commencement|come into force|effective (?:from|on))\b/iu,
      },
      { id: "prarambh", label: "प्रारंभ/अंमलात", pattern: /प्रारंभ|अंमलात/iu },
    ],
  },
];

const DIRECT_REGISTRATION =
  /\b(?:registration act|inspector general of registration|department of registration|stamp and registration|registration and stamps)\b|मुद्रांक.{0,40}नोंदणी|नोंदणी.{0,40}मुद्रांक/iu;

/** Exact accepted-archive occurrences whose generic listing titles hide
 * amendments already named by the calculator corpus. This is a bounded
 * discovery backstop, not a legal disposition or evidence link. */
const CURATED_DEPENDENCY_TARGETS = new Set([
  "mh-egazette-part8\u0000cc1ffaec3d7f2b32413c08994dadbc492481b61e21e173081172e3e8052b0646\u0000e0f9303510462e1e557e3fa2acfdd9c3a1b26317c9a7e7094ed54cbab6c91c98",
  "mh-egazette-part8\u0000b6f268deb4cfa5eaaa602f6340558329ab888244700f316630173b7ca37b8727\u0000d6b74b7dd8585dd25ea6eaa7e4346a3e292e19e2dbd8f939597d3dc88869acca",
]);

const MISSING_REQUIREMENTS: MaharashtraTriageReport["missing_requirements"] = [
  {
    requirement_id: "mh-current-stamp-act-and-schedule-spine",
    kind: "source_family",
    status: "unacquired",
    detail: "A current consolidated Maharashtra Stamp Act and Schedule spine, with authoritative historical baselines, is not present in the accepted catalog.",
  },
  {
    requirement_id: "mh-amendment-and-commencement-chain",
    kind: "chain_audit",
    status: "not_established",
    detail: "Title matches do not establish complete amendment, assent, publication, or commencement chains for any calculator dependency.",
  },
  {
    requirement_id: "mh-municipal-transport-cess-lbt-locality",
    kind: "source_family",
    status: "unacquired",
    detail: "Official municipal/transport cess, section 149A/149B stacking, LBT, and locality-applicability source families are not established in the catalog.",
  },
  {
    requirement_id: "mh-concession-remission-orders",
    kind: "source_family",
    status: "not_established",
    detail: "The accepted archive has not been content-reviewed into a complete concession, remission, exemption, or reduction instrument chain.",
  },
  {
    requirement_id: "mh-igr-registration-valuation",
    kind: "source_family",
    status: "not_established",
    detail: "The official IGR Maharashtra publications portal is registered provisionally, but registration, valuation, ASR/Ready Reckoner, fee, circular, and clarification history has not been discovered, acquired, repeated, or promoted.",
  },
];

const PART4B_MISSING_2021_ROW = {
  source_row_id: "473c8cdae40e7c93bb8268ad7614c9ed231e8536fb94445cb676f75fbafcf6ed",
  gazette_date: "2021-05-28",
  title:
    "67 | CENTRAL SECTION | Part -4 B | Extra - Ordinary | 2021/05/28 | 2021/05/28 | भाग चार-ब असाधारण क्र. १४१ : सार्वजनिक बांधकाम विभाग यांची अधिसूचना, क्रमांक खाक्षेस-2016/प्र.क्र.417/रस्ते-8, दिनांक दिनांक 28 मे 2021 | 0 | View",
} as const;

/** Exact pre-acceptance query contracts used to prove the 2015 product floor.
 * The accepted promotion baselines remain separate and are checked by
 * promotion.ts; these segments only describe the earlier backfill. */
export const MH_HISTORICAL_COVERAGE_REQUIREMENTS: Readonly<
  Record<string, readonly MaharashtraHistoricalCoverageSegmentRequirement[]>
> = {
  "mh-egazette-part8": [
    historicalSegment("2015-01-01", "2015-12-31", 120, 2),
    historicalSegment("2016-01-01", "2016-12-31", 116, 2),
    historicalSegment("2017-01-01", "2017-12-31", 161, 2),
    historicalSegment("2018-01-01", "2018-12-31", 152, 2),
    historicalSegment("2019-01-01", "2019-12-31", 105, 2),
    historicalSegment("2020-01-01", "2020-12-31", 105, 2),
    historicalSegment("2021-01-01", "2021-12-31", 74, 1),
    historicalSegment("2022-01-01", "2022-12-31", 88, 1),
    historicalSegment("2023-01-01", "2023-12-31", 119, 2),
    historicalSegment("2024-01-01", "2024-12-31", 99, 1),
    historicalSegment("2025-01-01", "2025-04-08", 34, 1),
  ],
  "mh-egazette-part4b": [
    historicalSegment("2015-01-01", "2015-12-31", 282, 3),
    historicalSegment("2016-01-01", "2016-12-31", 336, 4),
    historicalSegment("2017-01-01", "2017-12-31", 428, 5),
    historicalSegment("2018-01-01", "2018-12-31", 473, 5),
    historicalSegment("2019-01-01", "2019-12-31", 436, 5),
    historicalSegment("2020-01-01", "2020-12-31", 328, 4),
    {
      range_from: "2021-01-01",
      range_to: "2021-07-16",
      rows: 208,
      pages: 3,
      archived_occurrences: 207,
      missing_occurrences: [{ ...PART4B_MISSING_2021_ROW }],
    },
  ],
};

/** Build an occurrence-level title triage report. A context word such as
 * "amendment" never selects a record on its own. Domain-title matches are
 * selected directly, and every Part 8 enacted-law title is selected as a
 * deterministic backstop because a generic Act title can still amend the
 * Stamp Act in its body. The output is discovery metadata, never legal evidence. */
export function buildMaharashtraTriageReport(
  inputs: readonly MaharashtraTriageSourceInput[],
  contentInput?: MaharashtraTriageContentInput,
  historicalCoverageInput?: MaharashtraHistoricalCoverageInput,
  dispositionInput?: MaharashtraCandidateDispositionInput,
): MaharashtraTriageReport {
  const orderedInputs = [...inputs].sort((left, right) => left.source_id.localeCompare(right.source_id));
  const candidates: MaharashtraTriageCandidate[] = [];
  const sources: MaharashtraTriageReport["sources"] = [];
  const allOccurrences = new Set<string>();

  for (const input of orderedInputs) {
    validateInput(input);
    const preAcceptanceCoverage = assessHistoricalCoverage(input, historicalCoverageInput);
    const sourceCandidates: MaharashtraTriageCandidate[] = [];
    const observedDates: string[] = [];
    for (const document of input.documents) {
      const occurrenceId = `${document.source_id}\u0000${document.source_row_id}`;
      if (allOccurrences.has(occurrenceId)) {
        throw new WatchdogError(`Duplicate Maharashtra triage occurrence: ${occurrenceId}`, "shape_drift");
      }
      allOccurrences.add(occurrenceId);
      if (!input.occurrence_source_ids.includes(document.source_id)) {
        throw new WatchdogError(
          `Triage index ${input.index_path} contains unexpected source ${document.source_id}`,
          "shape_drift",
        );
      }
      const date = normalizeDate(document.gazette_date);
      if (date) observedDates.push(date);
      const titleMatches = titleMatchesFor(document.title);
      const hasDomainTitleMatch = titleMatches.some((match) => categoryRole(match.category) === "domain");
      const enactedLawBackstop =
        input.source_id === "mh-egazette-part8" && publicationStage(document.title) === "enacted_law";
      const curatedDependencyTarget = CURATED_DEPENDENCY_TARGETS.has(
        `${input.source_id}\u0000${document.source_row_id}\u0000${document.sha256}`,
      );
      if (!hasDomainTitleMatch && !enactedLawBackstop && !curatedDependencyTarget) continue;
      const onlyGenericRegistration =
        titleMatches.filter((match) => categoryRole(match.category) === "domain").every(
          (match) => match.category === "registration",
        ) && !DIRECT_REGISTRATION.test(document.title);
      sourceCandidates.push({
        candidate_id: createHash("sha256").update(occurrenceId).digest("hex"),
        source_id: input.source_id,
        occurrence_source_id: document.source_id,
        source_row_id: document.source_row_id,
        blob_sha256: document.sha256,
        gazette_date: date,
        title: document.title,
        publication_stage: publicationStage(document.title),
        selection_specificity: !hasDomainTitleMatch
          ? curatedDependencyTarget
            ? "curated_dependency_target"
            : "enacted_law_backstop"
          : onlyGenericRegistration
            ? "generic_registration_term"
            : "direct_domain_term",
        title_matches: titleMatches,
        content_scan: {
          status: "not_scanned",
          pages: 0,
          pages_with_text: 0,
          text_characters: 0,
          text_sha256: null,
          content_matches: [],
        },
        review_status: "unreviewed_candidate",
        engineering_disposition: null,
        review_locator: {
          blob_path: `${input.blob_root}/${document.sha256.slice(0, 2)}/${document.sha256}.pdf`,
          keyword_pages: [],
        },
        citation_eligible: false,
      });
    }
    sourceCandidates.sort(compareCandidates);
    candidates.push(...sourceCandidates);
    observedDates.sort();
    sources.push({
      source_id: input.source_id,
      accepted: true,
      index_path: input.index_path,
      index_sha256: input.index_sha256,
      manifest_path: input.manifest_path,
      manifest_sha256: input.manifest_sha256,
      requested_range: { from: input.range_from, to: input.range_to },
      observed_publication_dates: {
        from: observedDates.at(0) ?? null,
        to: observedDates.at(-1) ?? null,
      },
      document_occurrences: input.documents.length,
      unique_blobs: new Set(input.documents.map((document) => document.sha256)).size,
      candidate_occurrences: sourceCandidates.length,
      candidate_blobs: new Set(sourceCandidates.map((candidate) => candidate.blob_sha256)).size,
      category_occurrences: countCategories(sourceCandidates),
      publication_stage_occurrences: countPublicationStages(sourceCandidates),
      pre_acceptance_coverage: preAcceptanceCoverage,
    });
  }

  candidates.sort(compareCandidates);
  const contentSummary = contentInput ? attachContentReceipt(contentInput, orderedInputs, candidates) : null;
  if (dispositionInput) attachCandidateDispositions(dispositionInput, candidates);
  return {
    schema_version: 1,
    jurisdiction: "MH",
    product_floor: "2015-01-01",
    policy: {
      selection_scope: "title_metadata_with_enacted_law_backstop_then_candidate_content",
      content_scan_status: contentInput ? "selected_candidate_blobs_scanned" : "not_performed",
      content_receipt: contentInput ? {
        path: contentInput.receipt_path,
        sha256: contentInput.receipt_sha256,
        extractor: contentInput.receipt.extractor.tool,
        extractor_version: contentInput.receipt.extractor.version,
      } : null,
      candidate_dispositions: dispositionInput ? {
        path: dispositionInput.ledger_path,
        sha256: dispositionInput.ledger_sha256,
        entries: dispositionInput.ledger.entries.length,
        effect: "engineering_scope_triage_only",
        human_legal_review_required: true,
      } : null,
      candidate_effect: "triage_only",
      citation_eligible: false,
      limitation:
        "Title keywords, the Part 8 enacted-law backstop, and two exact corpus-named generic-title amendment occurrences select review candidates; title-derived publication-stage labels and candidate-body keyword pages only organize review. Keyword pages are not legal pinpoints. Unselected archive bodies, legal effect, and amendment/commencement completeness are not inferred.",
    },
    taxonomy: CATEGORY_DEFINITIONS.map((definition) => ({
      category: definition.category,
      role: definition.role,
      terms: definition.terms.map((term) => term.label),
    })),
    sources,
    totals: {
      document_occurrences: sources.reduce((total, source) => total + source.document_occurrences, 0),
      unique_blobs: new Set(orderedInputs.flatMap((input) => input.documents.map((document) => document.sha256))).size,
      candidate_occurrences: candidates.length,
      candidate_blobs: new Set(candidates.map((candidate) => candidate.blob_sha256)).size,
      category_occurrences: countCategories(candidates),
      publication_stage_occurrences: countPublicationStages(candidates),
      content_scan: contentSummary,
    },
    candidates,
    missing_requirements: [
      ...coverageMissingRequirements(sources),
      ...MISSING_REQUIREMENTS.map((requirement) => ({ ...requirement })),
    ],
  };
}

function assessHistoricalCoverage(
  input: MaharashtraTriageSourceInput,
  coverageInput: MaharashtraHistoricalCoverageInput | undefined,
): MaharashtraTriageReport["sources"][number]["pre_acceptance_coverage"] {
  const requirements = MH_HISTORICAL_COVERAGE_REQUIREMENTS[input.source_id];
  if (!coverageInput) {
    return {
      range_from: "2015-01-01",
      range_to: previousDate(input.range_from),
      status: "not_assessed",
      segments: [],
    };
  }
  if (!requirements || requirements.length === 0) {
    throw new WatchdogError(`No Maharashtra historical coverage contract: ${input.source_id}`, "shape_drift");
  }
  const expectedTo = previousDate(input.range_from);
  if (requirements[0]!.range_from !== "2015-01-01" || requirements.at(-1)!.range_to !== expectedTo) {
    throw new WatchdogError(`Maharashtra historical coverage does not meet the accepted range: ${input.source_id}`, "shape_drift");
  }
  for (let index = 1; index < requirements.length; index += 1) {
    if (nextDate(requirements[index - 1]!.range_to) !== requirements[index]!.range_from) {
      throw new WatchdogError(`Maharashtra historical coverage contract is discontinuous: ${input.source_id}`, "shape_drift");
    }
  }

  const evidenceIds = new Set(input.occurrence_source_ids);
  const sourceSweeps = coverageInput.sweeps.filter((sweep) => evidenceIds.has(sweep.source_id));
  const segments = requirements.map((requirement) => {
    const rangeDocuments = input.documents.filter((document) =>
      dateInRange(document.gazette_date, requirement.range_from, requirement.range_to)
    );
    if (rangeDocuments.length !== requirement.archived_occurrences) {
      throw new WatchdogError(
        `Maharashtra historical archive count is ${rangeDocuments.length}, expected ${requirement.archived_occurrences} for ${input.source_id} ${requirement.range_from}..${requirement.range_to}`,
        "shape_drift",
      );
    }
    for (const missing of requirement.missing_occurrences) {
      if (input.documents.some((document) => document.source_row_id === missing.source_row_id)) {
        throw new WatchdogError(`Maharashtra declared missing occurrence is archived: ${missing.source_row_id}`, "shape_drift");
      }
    }
    const expectedStatus = requirement.missing_occurrences.length === 0 ? "ok" : "partial";
    const qualifyingRuns = sourceSweeps.filter((sweep) =>
      sweep.range_from === requirement.range_from &&
      sweep.range_to === requirement.range_to &&
      sweep.status === expectedStatus &&
      sweep.rows_seen === requirement.rows &&
      sweep.pages_fetched === requirement.pages &&
      sweep.pages_expected === requirement.pages &&
      (expectedStatus === "ok" || partialGapMatches(sweep, requirement))
    ).sort((left, right) => left.finished_at.localeCompare(right.finished_at) || left.run_id.localeCompare(right.run_id));
    const run = qualifyingRuns.at(-1);
    if (!run) {
      throw new WatchdogError(
        `No qualifying Maharashtra historical sweep for ${input.source_id} ${requirement.range_from}..${requirement.range_to}`,
        "shape_drift",
      );
    }
    const receipts = coverageInput.events.filter((event) =>
      event.run_id === run.run_id && event.type === "document_acquired"
    );
    if (receipts.length !== 1) {
      throw new WatchdogError(`Historical sweep ${run.run_id} must have one acquisition receipt`, "shape_drift");
    }
    const receiptDocuments = [...(receipts[0]!.documents ?? [])].sort();
    const expectedDocuments = rangeDocuments.map((document) => document.sha256).sort();
    if (JSON.stringify(receiptDocuments) !== JSON.stringify(expectedDocuments)) {
      throw new WatchdogError(`Historical sweep ${run.run_id} acquisition receipt is stale`, "shape_drift");
    }
    return {
      range_from: requirement.range_from,
      range_to: requirement.range_to,
      status: requirement.missing_occurrences.length === 0 ? "complete" as const : "one_document_gap" as const,
      run_id: run.run_id,
      rows_listed: requirement.rows,
      pages_fetched: requirement.pages,
      pages_expected: requirement.pages,
      archived_occurrences: rangeDocuments.length,
      acquisition_receipt_occurrences: receiptDocuments.length,
      missing_occurrences: requirement.missing_occurrences.map((missing) => ({ ...missing })),
    };
  });
  const missingCount = segments.reduce((total, segment) => total + segment.missing_occurrences.length, 0);
  if (missingCount > 1) {
    throw new WatchdogError(`Maharashtra historical coverage has ${missingCount} document gaps`, "shape_drift");
  }
  return {
    range_from: "2015-01-01",
    range_to: expectedTo,
    status: missingCount === 0 ? "complete" : "one_document_gap",
    segments,
  };
}

function coverageMissingRequirements(
  sources: MaharashtraTriageReport["sources"],
): MaharashtraTriageReport["missing_requirements"] {
  const missing: MaharashtraTriageReport["missing_requirements"] = [];
  for (const source of sources) {
    if (source.pre_acceptance_coverage.status === "not_assessed") {
      missing.push({
        requirement_id: `${source.source_id}-historical-coverage-assessment`,
        kind: "coverage_gap",
        status: "not_established",
        detail: `${source.source_id} pre-acceptance coverage has not been machine-assessed.`,
      });
    }
    for (const segment of source.pre_acceptance_coverage.segments) {
      for (const occurrence of segment.missing_occurrences) {
        missing.push({
          requirement_id: `${source.source_id}-missing-${occurrence.source_row_id}`,
          kind: "document_gap",
          status: "unacquired",
          detail:
            `${source.source_id} is missing the official ${occurrence.gazette_date} occurrence ` +
            `${occurrence.source_row_id}: ${occurrence.title}`,
        });
      }
    }
  }
  return missing;
}

export function renderMaharashtraTriageReport(report: MaharashtraTriageReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Render a deterministic human-review worklist. The locators are keyword
 * triage aids only and deliberately carry no citation or legal-effect field. */
export function renderMaharashtraReviewQueue(report: MaharashtraTriageReport): string {
  const stages: Array<{
    id: MaharashtraTriageCandidate["publication_stage"];
    heading: string;
  }> = [
    { id: "enacted_law", heading: "Enacted-law title candidates" },
    { id: "bill", heading: "Bill title candidates" },
    { id: "notification_or_order", heading: "Notification/order title candidates" },
    { id: "other", heading: "Other title candidates" },
  ];
  const lines = [
    "# Maharashtra Watchdog Review Queue",
    "",
    "Generated deterministically from `WATCHDOG-MH-EVIDENCE-CANDIDATES.json` inputs. Every item remains pending human legal review. An engineering disposition may record that no direct current calculator dependency was identified, but it is not legal approval. Publication stages come from titles; keyword pages are not legal pinpoints; nothing here is citation-eligible or establishes legal effect, completeness, amendment, or commencement.",
    "",
    "## Summary",
    "",
    `- Archived occurrences considered: **${report.totals.document_occurrences}**`,
    `- Selected candidate occurrences: **${report.totals.candidate_occurrences}**`,
    `- Candidate blobs: **${report.totals.candidate_blobs}**`,
    `- Enacted-law / bill / notification-order / other: **${report.totals.publication_stage_occurrences.enacted_law} / ${report.totals.publication_stage_occurrences.bill} / ${report.totals.publication_stage_occurrences.notification_or_order} / ${report.totals.publication_stage_occurrences.other}**`,
    "",
    "A reviewer must confirm the instrument identity and legal effect, record an exact quoted pinpoint, and complete the baseline/amendment/commencement chain before creating any calculator evidence link.",
    "",
  ];
  for (const stage of stages) {
    const candidates = report.candidates.filter((candidate) => candidate.publication_stage === stage.id);
    lines.push(`## ${stage.heading} (${candidates.length})`, "");
    for (const candidate of candidates) {
      const titleMatches = candidate.title_matches.map((match) => match.category).join(", ");
      const contentMatches = candidate.content_scan.content_matches.map((match) =>
        `${match.category} p.${match.pages.join(",")}`
      ).join("; ") || `none (${candidate.content_scan.status})`;
      const keywordPages = candidate.review_locator.keyword_pages.length > 0
        ? candidate.review_locator.keyword_pages.join(", ")
        : "none";
      lines.push(
        `- [ ] ${candidate.gazette_date ?? "date unavailable"} · ${candidate.source_id} · ${escapeMarkdown(candidate.title)}`,
        `  - occurrence: \`${candidate.occurrence_source_id}/${candidate.source_row_id}\``,
        `  - blob: \`${candidate.review_locator.blob_path}\` (\`${candidate.blob_sha256}\`)`,
        `  - title categories: ${titleMatches}; specificity: ${candidate.selection_specificity}`,
        `  - content keyword matches: ${contentMatches}; combined keyword pages: ${keywordPages}`,
        ...(candidate.engineering_disposition ? [
          `  - engineering scope triage: ${candidate.engineering_disposition.status}; human legal review still required`,
          `  - instrument summary: ${candidate.engineering_disposition.instrument_summary}`,
          `  - rationale: ${candidate.engineering_disposition.engineering_rationale}`,
          `  - revisit if: ${candidate.engineering_disposition.revisit_if}`,
        ] : []),
      );
    }
    lines.push("");
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function attachCandidateDispositions(
  input: MaharashtraCandidateDispositionInput,
  candidates: MaharashtraTriageCandidate[],
): void {
  const { ledger } = input;
  if (!/^[a-f0-9]{64}$/.test(input.ledger_sha256)) {
    throw new WatchdogError(`Maharashtra candidate-disposition digest is invalid: ${input.ledger_path}`, "shape_drift");
  }
  if (
    ledger.schema_version !== 1 || ledger.jurisdiction !== "MH" ||
    ledger.policy.effect !== "engineering_scope_triage_only" ||
    ledger.policy.citation_eligible !== false || ledger.policy.human_legal_review_required !== true ||
    ledger.policy.product_scope.trim().length === 0 || ledger.policy.limitation.trim().length === 0
  ) {
    throw new WatchdogError(`Invalid Maharashtra candidate-disposition policy: ${input.ledger_path}`, "shape_drift");
  }
  const seen = new Set<string>();
  for (const entry of ledger.entries) {
    if (seen.has(entry.candidate_id)) {
      throw new WatchdogError(`Duplicate Maharashtra candidate disposition: ${entry.candidate_id}`, "shape_drift");
    }
    seen.add(entry.candidate_id);
    const candidate = candidates.find((value) => value.candidate_id === entry.candidate_id);
    if (
      !candidate || candidate.source_id !== entry.source_id || candidate.source_row_id !== entry.source_row_id ||
      candidate.blob_sha256 !== entry.blob_sha256 || candidate.content_scan.status !== "text" ||
      candidate.content_scan.text_sha256 !== entry.text_sha256 ||
      entry.status !== "no_direct_current_calculator_dependency_identified" ||
      entry.instrument_summary.trim().length === 0 || entry.engineering_rationale.trim().length === 0 ||
      entry.revisit_if.trim().length === 0
    ) {
      throw new WatchdogError(`Stale or invalid Maharashtra candidate disposition: ${entry.candidate_id}`, "shape_drift");
    }
    candidate.review_status = "engineering_triaged_human_review_required";
    candidate.engineering_disposition = { ...entry };
  }
}

function attachContentReceipt(
  input: MaharashtraTriageContentInput,
  sources: readonly MaharashtraTriageSourceInput[],
  candidates: MaharashtraTriageCandidate[],
): NonNullable<MaharashtraTriageReport["totals"]["content_scan"]> {
  const receipt = input.receipt;
  if (!/^[a-f0-9]{64}$/.test(input.receipt_sha256)) {
    throw new WatchdogError(`Maharashtra content receipt digest is invalid: ${input.receipt_path}`, "shape_drift");
  }
  if (
    receipt.schema_version !== 1 || receipt.jurisdiction !== "MH" ||
    receipt.policy.effect !== "triage_only" || receipt.policy.citation_eligible !== false ||
    receipt.policy.ocr_performed !== false ||
    receipt.policy.scan_scope !== "title_candidates_enacted_law_backstop_and_curated_dependency_targets"
  ) {
    throw new WatchdogError(`Invalid Maharashtra content receipt policy: ${input.receipt_path}`, "shape_drift");
  }
  const expectedTaxonomy = CATEGORY_DEFINITIONS.map((definition) => ({
    category: definition.category,
    role: definition.role,
    term_ids: definition.terms.map((term) => term.id),
  }));
  if (JSON.stringify(receipt.taxonomy) !== JSON.stringify(expectedTaxonomy)) {
    throw new WatchdogError(`Maharashtra content receipt taxonomy is stale`, "shape_drift");
  }

  const candidateKeys = new Set(candidates.map(contentKey));
  const archiveUniqueBlobs = sources.reduce(
    (total, source) => total + new Set(source.documents.map((document) => document.sha256)).size,
    0,
  );
  const expectedSources = sources.map((source) => {
    const sourceCandidates = candidates.filter((candidate) => candidate.source_id === source.source_id);
    return {
      source,
      candidateBlobs: new Set(sourceCandidates.map((candidate) => candidate.blob_sha256)).size,
    };
  });
  if (receipt.sources.length !== expectedSources.length) {
    throw new WatchdogError(`Maharashtra content receipt source count is stale`, "shape_drift");
  }
  for (const expected of expectedSources) {
    const actual = receipt.sources.find((source) => source.source_id === expected.source.source_id);
    if (
      !actual || actual.index_path !== expected.source.index_path ||
      actual.index_sha256 !== expected.source.index_sha256 ||
      actual.manifest_path !== expected.source.manifest_path ||
      actual.manifest_sha256 !== expected.source.manifest_sha256 ||
      actual.document_occurrences !== expected.source.documents.length ||
      actual.archive_unique_blobs !== new Set(expected.source.documents.map((document) => document.sha256)).size ||
      actual.selected_blobs !== expected.candidateBlobs ||
      !/^[a-f0-9]{64}$/.test(actual.manifest_sha256)
    ) {
      throw new WatchdogError(`Maharashtra content receipt source is stale: ${expected.source.source_id}`, "shape_drift");
    }
  }

  const blobByKey = new Map<string, MaharashtraContentExtractionReceipt["blobs"][number]>();
  for (const blob of receipt.blobs) {
    const key = `${blob.source_id}\u0000${blob.sha256}`;
    if (blobByKey.has(key)) throw new WatchdogError(`Duplicate Maharashtra content blob: ${key}`, "shape_drift");
    if (!candidateKeys.has(key) || !/^[a-f0-9]{64}$/.test(blob.sha256)) {
      throw new WatchdogError(`Unexpected Maharashtra content blob: ${key}`, "shape_drift");
    }
    validateContentBlob(blob);
    const source = sources.find((candidate) => candidate.source_id === blob.source_id)!;
    const expectedOccurrences = source.documents
      .filter((document) => document.sha256 === blob.sha256)
      .map((document) => ({ source_id: document.source_id, source_row_id: document.source_row_id }))
      .sort((left, right) =>
        left.source_id.localeCompare(right.source_id) || left.source_row_id.localeCompare(right.source_row_id)
      );
    if (JSON.stringify(blob.occurrences) !== JSON.stringify(expectedOccurrences)) {
      throw new WatchdogError(`Maharashtra content blob occurrences are stale: ${key}`, "shape_drift");
    }
    blobByKey.set(key, blob);
  }
  if (blobByKey.size !== candidateKeys.size) {
    throw new WatchdogError(
      `Maharashtra content receipt is partial (${blobByKey.size}/${candidateKeys.size} candidate blobs)`,
      "shape_drift",
    );
  }

  for (const candidate of candidates) {
    const blob = blobByKey.get(contentKey(candidate))!;
    candidate.content_scan = {
      status: blob.status,
      pages: blob.pages,
      pages_with_text: blob.pages_with_text,
      text_characters: blob.text_characters,
      text_sha256: blob.text_sha256,
      content_matches: blob.content_matches.map((match) => ({
        category: match.category,
        terms: [...match.terms],
        pages: [...match.pages],
      })),
    };
    candidate.review_locator.keyword_pages = [...new Set(
      blob.content_matches.flatMap((match) => match.pages),
    )].sort((left, right) => left - right);
  }

  const statusBlobs = {
    text: receipt.blobs.filter((blob) => blob.status === "text").length,
    empty: receipt.blobs.filter((blob) => blob.status === "empty").length,
    failed: receipt.blobs.filter((blob) => blob.status === "failed").length,
  };
  const categoryBlobs = Object.fromEntries(CATEGORY_DEFINITIONS.map((definition) => [
    definition.category,
    receipt.blobs.filter((blob) =>
      blob.content_matches.some((match) => match.category === definition.category)
    ).length,
  ])) as Record<MaharashtraTriageCategory, number>;
  const domainContentBlobs = receipt.blobs.filter((blob) =>
    blob.content_matches.some((match) => categoryRole(match.category) === "domain")
  ).length;
  if (
    receipt.summary.archive_unique_blobs !== archiveUniqueBlobs ||
    receipt.summary.selected_blobs !== candidateKeys.size ||
    receipt.summary.unscanned_blobs !== archiveUniqueBlobs - candidateKeys.size ||
    receipt.summary.candidate_blobs !== domainContentBlobs ||
    JSON.stringify(receipt.summary.status_blobs) !== JSON.stringify(statusBlobs) ||
    JSON.stringify(receipt.summary.category_blobs) !== JSON.stringify(categoryBlobs)
  ) {
    throw new WatchdogError(`Maharashtra content receipt summary is stale`, "shape_drift");
  }
  return {
    archive_unique_blobs: archiveUniqueBlobs,
    selected_blobs: candidateKeys.size,
    unscanned_blobs: archiveUniqueBlobs - candidateKeys.size,
    text_blobs: statusBlobs.text,
    empty_blobs: statusBlobs.empty,
    failed_blobs: statusBlobs.failed,
    category_blobs: categoryBlobs,
  };
}

function validateContentBlob(blob: MaharashtraContentExtractionReceipt["blobs"][number]): void {
  if (
    !Number.isSafeInteger(blob.pages) || blob.pages < 0 ||
    !Number.isSafeInteger(blob.pages_with_text) || blob.pages_with_text < 0 || blob.pages_with_text > blob.pages ||
    !Number.isSafeInteger(blob.text_characters) || blob.text_characters < 0 ||
    (blob.text_sha256 !== null && !/^[a-f0-9]{64}$/.test(blob.text_sha256)) ||
    !["text", "empty", "failed"].includes(blob.status)
  ) {
    throw new WatchdogError(`Invalid Maharashtra content extraction receipt for ${blob.sha256}`, "shape_drift");
  }
  for (const match of blob.content_matches) {
    const definition = CATEGORY_DEFINITIONS.find((candidate) => candidate.category === match.category);
    const allowedTerms = new Set(definition?.terms.map((term) => term.id) ?? []);
    if (
      !definition || match.terms.length === 0 || match.terms.some((term) => !allowedTerms.has(term)) ||
      match.pages.length === 0 || match.pages.some((page) => !Number.isSafeInteger(page) || page < 1 || page > blob.pages)
    ) {
      throw new WatchdogError(`Invalid Maharashtra content match for ${blob.sha256}`, "shape_drift");
    }
  }
}

function contentKey(candidate: MaharashtraTriageCandidate): string {
  return `${candidate.source_id}\u0000${candidate.blob_sha256}`;
}

function titleMatchesFor(title: string): MaharashtraTriageTitleMatch[] {
  const matches: MaharashtraTriageTitleMatch[] = [];
  for (const definition of CATEGORY_DEFINITIONS) {
    const terms = definition.terms.filter((term) => term.pattern.test(title)).map((term) => term.id);
    if (terms.length > 0) matches.push({ category: definition.category, terms });
  }
  return matches;
}

function countCategories(
  candidates: readonly MaharashtraTriageCandidate[],
): Record<MaharashtraTriageCategory, number> {
  return Object.fromEntries(
    CATEGORY_DEFINITIONS.map((definition) => [
      definition.category,
      candidates.filter((candidate) =>
        candidate.title_matches.some((match) => match.category === definition.category)
      ).length,
    ]),
  ) as Record<MaharashtraTriageCategory, number>;
}

function countPublicationStages(
  candidates: readonly MaharashtraTriageCandidate[],
): Record<MaharashtraTriageCandidate["publication_stage"], number> {
  const stages: MaharashtraTriageCandidate["publication_stage"][] = [
    "enacted_law",
    "bill",
    "notification_or_order",
    "other",
  ];
  return Object.fromEntries(stages.map((stage) => [
    stage,
    candidates.filter((candidate) => candidate.publication_stage === stage).length,
  ])) as Record<MaharashtraTriageCandidate["publication_stage"], number>;
}

function publicationStage(title: string): MaharashtraTriageCandidate["publication_stage"] {
  if (/\b(?:L\.?\s*A\.?\s*)?BILL\b/iu.test(title)) return "bill";
  if (/\b(?:notification|order)\b|अधिसूचना|आदेश/iu.test(title)) return "notification_or_order";
  if (/\b(?:MAHARASHTRA\s+)?ACT\b/iu.test(title)) return "enacted_law";
  return "other";
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function categoryRole(category: MaharashtraTriageCategory): "domain" | "context" {
  return CATEGORY_DEFINITIONS.find((definition) => definition.category === category)!.role;
}

function compareCandidates(left: MaharashtraTriageCandidate, right: MaharashtraTriageCandidate): number {
  return (
    left.source_id.localeCompare(right.source_id) ||
    (left.gazette_date ?? "").localeCompare(right.gazette_date ?? "") ||
    left.source_row_id.localeCompare(right.source_row_id)
  );
}

function normalizeDate(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.replaceAll("/", "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new WatchdogError(`Invalid Maharashtra triage gazette date: ${value}`, "shape_drift");
  }
  return normalized;
}

function historicalSegment(
  rangeFrom: string,
  rangeTo: string,
  rows: number,
  pages: number,
): MaharashtraHistoricalCoverageSegmentRequirement {
  return {
    range_from: rangeFrom,
    range_to: rangeTo,
    rows,
    pages,
    archived_occurrences: rows,
    missing_occurrences: [],
  };
}

function dateInRange(value: string | undefined, from: string, to: string): boolean {
  if (value === undefined) return false;
  const normalized = value.replaceAll("/", "-");
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && normalized >= from && normalized <= to;
}

function partialGapMatches(
  sweep: SweepRun,
  requirement: MaharashtraHistoricalCoverageSegmentRequirement,
): boolean {
  return requirement.missing_occurrences.every((missing) =>
    sweep.error?.includes(missing.source_row_id) === true
  ) && sweep.error?.includes(`covered ${requirement.archived_occurrences} of ${requirement.rows}`) === true;
}

function previousDate(value: string): string {
  return shiftDate(value, -1);
}

function nextDate(value: string): string {
  return shiftDate(value, 1);
}

function shiftDate(value: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new WatchdogError(`Invalid Maharashtra coverage date: ${value}`, "shape_drift");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validateInput(input: MaharashtraTriageSourceInput): void {
  if (!input.accepted) {
    throw new WatchdogError(`Maharashtra triage source is not accepted: ${input.source_id}`, "shape_drift");
  }
  if (!/^[a-f0-9]{64}$/.test(input.index_sha256)) {
    throw new WatchdogError(`Maharashtra triage index digest is invalid: ${input.index_path}`, "shape_drift");
  }
  if (!/^[a-f0-9]{64}$/.test(input.manifest_sha256)) {
    throw new WatchdogError(`Maharashtra triage manifest digest is invalid: ${input.manifest_path}`, "shape_drift");
  }
  if (!/^watchdog-data\//.test(input.blob_root) || input.blob_root.includes("..")) {
    throw new WatchdogError(`Maharashtra triage blob root is invalid: ${input.blob_root}`, "shape_drift");
  }
  if (input.occurrence_source_ids.length === 0) {
    throw new WatchdogError(`Maharashtra triage source has no occurrence IDs: ${input.source_id}`, "shape_drift");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.range_from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.range_to)) {
    throw new WatchdogError(`Maharashtra triage source has an invalid requested range: ${input.source_id}`, "shape_drift");
  }
  for (const document of input.documents) {
    if (!/^[a-f0-9]{64}$/.test(document.sha256) || document.source_row_id.length === 0) {
      throw new WatchdogError(`Maharashtra triage index contains an invalid occurrence`, "shape_drift");
    }
  }
}
