import { describe, expect, it } from "vitest";
import {
  buildMaharashtraTriageReport,
  renderMaharashtraReviewQueue,
  renderMaharashtraTriageReport,
  type MaharashtraContentExtractionReceipt,
} from "./triage.js";
import type { DocumentRecord } from "./types.js";

describe("Maharashtra evidence title triage", () => {
  it("selects domain titles and every Part 8 enacted law without making candidates citable", () => {
    const report = buildMaharashtraTriageReport([
      input([
        document("row-3", "A general Act further to amend an unrelated law", "2026/01/03", "3"),
        document("row-2", "महाराष्ट्र विवाह नोंदणी नियम", "2026/01/02", "2"),
        document("row-1", "An Act to amend the Maharashtra Stamp Act", "2026/01/01", "1"),
        document("row-4", "Ready Reckoner effective from 1 April", "2026/01/04", "4"),
        document("row-5", "Order under the Maharashtra Stamp Act", "2026/01/05", "5"),
      ]),
    ]);

    expect(report.candidates.map((candidate) => candidate.source_row_id)).toEqual([
      "row-1", "row-2", "row-3", "row-4", "row-5",
    ]);
    expect(report.candidates[0]).toMatchObject({
      selection_specificity: "direct_domain_term",
      publication_stage: "enacted_law",
      review_status: "unreviewed_candidate",
      citation_eligible: false,
      title_matches: [
        { category: "stamp", terms: ["stamp"] },
        { category: "amendment", terms: ["amendment"] },
      ],
    });
    expect(report.candidates[1]!.selection_specificity).toBe("generic_registration_term");
    expect(report.candidates[2]).toMatchObject({
      selection_specificity: "enacted_law_backstop",
      publication_stage: "enacted_law",
      title_matches: [{ category: "amendment", terms: ["amendment"] }],
    });
    expect(report.candidates[3]!.title_matches.map((match) => match.category)).toEqual([
      "valuation",
      "commencement",
    ]);
    expect(report.candidates[4]!.publication_stage).toBe("notification_or_order");
    expect(report.totals.publication_stage_occurrences).toEqual({
      enacted_law: 2,
      bill: 0,
      notification_or_order: 1,
      other: 2,
    });
    expect(report.totals).toMatchObject({
      document_occurrences: 5,
      candidate_occurrences: 5,
      category_occurrences: { stamp: 2, registration: 1, valuation: 1, amendment: 2, commencement: 1 },
    });
    expect(report.policy).toMatchObject({
      selection_scope: "title_metadata_with_enacted_law_backstop_then_candidate_content",
      content_scan_status: "not_performed",
      candidate_dispositions: null,
      citation_eligible: false,
    });
    expect(renderMaharashtraTriageReport(report)).toBe(renderMaharashtraTriageReport(report));
    const queue = renderMaharashtraReviewQueue(report);
    expect(queue).toContain("Every item remains pending human legal review");
    expect(queue).toContain("Enacted-law title candidates (2)");
    expect(queue).toContain("watchdog-data/blobs/11/");
    expect(queue).not.toContain("citation-eligible: true");
  });

  it("refuses an unaccepted input or unexpected occurrence source", () => {
    expect(() => buildMaharashtraTriageReport([{ ...input([]), accepted: false }])).toThrow(/not accepted/);
    expect(() =>
      buildMaharashtraTriageReport([input([{ ...document("row-1", "Stamp Act", "2026/01/01", "1"), source_id: "other" }])])
    ).toThrow(/unexpected source/);

    const part4bDocument = {
      ...document("row-2", "A general Act further to amend an unrelated law", "2026/01/02", "2"),
      source_id: "mh-egazette-part4b",
    };
    const part4bInput = {
      ...input([part4bDocument]),
      source_id: "mh-egazette-part4b",
      occurrence_source_ids: ["mh-egazette-part4b"],
    };
    expect(buildMaharashtraTriageReport([part4bInput]).candidates).toHaveLength(0);
  });

  it("selects exact corpus-named amendments whose Gazette listing titles are generic", () => {
    const generic = {
      ...document(
        "b6f268deb4cfa5eaaa602f6340558329ab888244700f316630173b7ca37b8727",
        "Part VIII (Ex. 143) (Sept 7th 2017)",
        "2017/09/07",
        "d",
      ),
      sha256: "d6b74b7dd8585dd25ea6eaa7e4346a3e292e19e2dbd8f939597d3dc88869acca",
    };
    const report = buildMaharashtraTriageReport([input([generic])]);
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({
      source_row_id: "b6f268deb4cfa5eaaa602f6340558329ab888244700f316630173b7ca37b8727",
      blob_sha256: "d6b74b7dd8585dd25ea6eaa7e4346a3e292e19e2dbd8f939597d3dc88869acca",
      selection_specificity: "curated_dependency_target",
      review_status: "unreviewed_candidate",
      citation_eligible: false,
    });
  });

  it("binds an exact candidate-body receipt and rejects a stale summary", () => {
    const source = input([document("row-1", "Maharashtra Stamp Act", "2026/01/01", "1")]);
    const receipt = contentReceipt();
    const content = {
      receipt_path: "WATCHDOG-MH-CONTENT-EXTRACTION.json",
      receipt_sha256: "c".repeat(64),
      receipt,
    };
    const report = buildMaharashtraTriageReport([source], content);
    expect(report.policy).toMatchObject({
      content_scan_status: "selected_candidate_blobs_scanned",
      content_receipt: { sha256: "c".repeat(64), extractor: "pypdf", extractor_version: "6.14.2" },
    });
    expect(report.totals.content_scan).toMatchObject({
      archive_unique_blobs: 1,
      selected_blobs: 1,
      unscanned_blobs: 0,
      text_blobs: 1,
    });
    expect(report.candidates[0]!.content_scan).toMatchObject({
      status: "text",
      content_matches: [{ category: "stamp", terms: ["stamp"], pages: [1] }],
    });
    expect(report.candidates[0]!.review_locator).toEqual({
      blob_path: `watchdog-data/blobs/11/${"1".repeat(64)}.pdf`,
      keyword_pages: [1],
    });

    const stale = structuredClone(receipt);
    stale.summary.selected_blobs = 0;
    expect(() => buildMaharashtraTriageReport([source], { ...content, receipt: stale })).toThrow(/summary is stale/);
  });

  it("binds engineering scope dispositions to exact extracted candidates without making them citable", () => {
    const source = input([document("row-1", "Maharashtra Stamp Act", "2026/01/01", "1")]);
    const content = {
      receipt_path: "WATCHDOG-MH-CONTENT-EXTRACTION.json",
      receipt_sha256: "c".repeat(64),
      receipt: contentReceipt(),
    };
    const candidateId = buildMaharashtraTriageReport([source], content).candidates[0]!.candidate_id;
    const ledger = dispositionLedger(candidateId);
    const report = buildMaharashtraTriageReport([source], content, undefined, {
      ledger_path: "WATCHDOG-MH-CANDIDATE-DISPOSITIONS.json",
      ledger_sha256: "e".repeat(64),
      ledger,
    });

    expect(report.policy.candidate_dispositions).toEqual({
      path: "WATCHDOG-MH-CANDIDATE-DISPOSITIONS.json",
      sha256: "e".repeat(64),
      entries: 1,
      effect: "engineering_scope_triage_only",
      human_legal_review_required: true,
    });
    expect(report.candidates[0]).toMatchObject({
      review_status: "engineering_triaged_human_review_required",
      citation_eligible: false,
      engineering_disposition: {
        status: "no_direct_current_calculator_dependency_identified",
      },
    });
    expect(renderMaharashtraReviewQueue(report)).toContain("human legal review still required");

    const stale = structuredClone(ledger);
    stale.entries[0]!.text_sha256 = "f".repeat(64);
    expect(() => buildMaharashtraTriageReport([source], content, undefined, {
      ledger_path: "WATCHDOG-MH-CANDIDATE-DISPOSITIONS.json",
      ledger_sha256: "e".repeat(64),
      ledger: stale,
    })).toThrow(/Stale or invalid Maharashtra candidate disposition/);
  });
});

function input(documents: DocumentRecord[]) {
  return {
    source_id: "mh-egazette-part8",
    occurrence_source_ids: ["mh-egazette"],
    index_path: "watchdog-data/index/documents.jsonl",
    index_sha256: "a".repeat(64),
    manifest_path: "watchdog-data/state/blob-manifest.json",
    manifest_sha256: "b".repeat(64),
    blob_root: "watchdog-data/blobs",
    accepted: true,
    range_from: "2025-04-09",
    range_to: "2026-07-16",
    documents,
  };
}

function document(row: string, title: string, gazetteDate: string, hash: string): DocumentRecord {
  return {
    sha256: hash.repeat(64),
    source_id: "mh-egazette",
    source_row_id: row,
    title,
    gazette_date: gazetteDate,
    fetched_at: "2026-07-21T00:00:00.000Z",
    retrieval: { url: "https://egazzete.mahaonline.gov.in/Forms/GazetteSearch.aspx" },
    media_type: "application/pdf",
    ocr: null,
  };
}

function contentReceipt(): MaharashtraContentExtractionReceipt {
  const zeroCategories = {
    stamp: 1,
    registration: 0,
    valuation: 0,
    surcharge_cess: 0,
    concession_remission: 0,
    amendment: 0,
    commencement: 0,
  };
  return {
    schema_version: 1,
    jurisdiction: "MH",
    extractor: {
      tool: "pypdf",
      version: "6.14.2",
      text_method: "page.extract_text()",
      normalization: "NFKC",
    },
    policy: {
      effect: "triage_only",
      citation_eligible: false,
      ocr_performed: false,
      scan_scope: "title_candidates_enacted_law_backstop_and_curated_dependency_targets",
      limitation: "Candidate discovery only.",
    },
    taxonomy: [
      { category: "stamp", role: "domain", term_ids: ["stamp", "mudrank_latin", "mudrank_marathi"] },
      { category: "registration", role: "domain", term_ids: ["registration", "nondani"] },
      { category: "valuation", role: "domain", term_ids: ["valuation", "mulyankan"] },
      { category: "surcharge_cess", role: "domain", term_ids: ["surcharge_cess", "adhibhar_upkar"] },
      { category: "concession_remission", role: "domain", term_ids: ["concession_remission", "savalat_maphi"] },
      { category: "amendment", role: "context", term_ids: ["amendment", "sudharana"] },
      { category: "commencement", role: "context", term_ids: ["commencement", "prarambh"] },
    ],
    sources: [{
      source_id: "mh-egazette-part8",
      index_path: "watchdog-data/index/documents.jsonl",
      index_sha256: "a".repeat(64),
      manifest_path: "watchdog-data/state/blob-manifest.json",
      manifest_sha256: "b".repeat(64),
      document_occurrences: 1,
      archive_unique_blobs: 1,
      selected_blobs: 1,
    }],
    summary: {
      archive_unique_blobs: 1,
      selected_blobs: 1,
      unscanned_blobs: 0,
      status_blobs: { text: 1, empty: 0, failed: 0 },
      candidate_blobs: 1,
      category_blobs: zeroCategories,
    },
    blobs: [{
      source_id: "mh-egazette-part8",
      sha256: "1".repeat(64),
      occurrences: [{ source_id: "mh-egazette", source_row_id: "row-1" }],
      status: "text",
      pages: 1,
      pages_with_text: 1,
      text_characters: 21,
      text_sha256: "d".repeat(64),
      content_matches: [{ category: "stamp", terms: ["stamp"], pages: [1] }],
    }],
  };
}

function dispositionLedger(candidateId: string) {
  return {
    schema_version: 1 as const,
    jurisdiction: "MH" as const,
    policy: {
      effect: "engineering_scope_triage_only" as const,
      citation_eligible: false as const,
      human_legal_review_required: true as const,
      product_scope: "Duty computation only.",
      limitation: "Engineering triage is not legal approval.",
    },
    entries: [{
      candidate_id: candidateId,
      source_id: "mh-egazette-part8",
      source_row_id: "row-1",
      blob_sha256: "1".repeat(64),
      text_sha256: "d".repeat(64),
      status: "no_direct_current_calculator_dependency_identified" as const,
      instrument_summary: "Administrative procedure change.",
      engineering_rationale: "No current computation dependency references the amended procedure.",
      revisit_if: "The product adds the affected workflow.",
    }],
  };
}
