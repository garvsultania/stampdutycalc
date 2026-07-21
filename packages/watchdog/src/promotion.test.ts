import { describe, expect, it } from "vitest";
import { assessSourcePromotion, renderPromotionReport } from "./promotion.js";
import { sourceById } from "./sources.js";
import type { DocumentRecord, SweepRun, WatchdogEvent } from "./types.js";

const SOURCE = sourceById("mh-egazette-part8");
const SENTINELS = [
  "MAHARASHTRA ACT No. LXIII OF 2025",
  "MAHARASHTRA ACT No. XIII OF 2026",
  "MAHARASHTRA ACT No. XVI OF 2026",
  "MAHARASHTRA ACT No. XXIX OF 2026",
];

describe("Watchdog source promotion", () => {
  it("derives accepted status from an exact repeat-run report with zero latest additions", () => {
    const fixture = acceptedFixture();
    const report = assessSourcePromotion(SOURCE, fixture.documents, fixture.sweeps, fixture.events);

    expect(report).toMatchObject({
      schema_version: 1,
      source_id: "mh-egazette-part8",
      status: "accepted",
      eligible: true,
      reasons: [],
      requested: {
        range_from: "2025-04-09",
        range_to: "2026-07-16",
        rows: 195,
        pages: 2,
        unique_blobs: 195,
        repeat_runs: 2,
      },
      observed: {
        catalog_document_occurrences: 195,
        document_occurrences: 195,
        unique_occurrences: 195,
        unique_blobs: 195,
        latest_repeat_additions: 0,
      },
    });
    expect(report.observed.complete_runs.map((run) => run.run_id)).toEqual(["run-1", "run-2"]);
    expect(report.observed.other_complete_runs).toEqual([]);
    expect(report.observed.sentinels.every((sentinel) => sentinel.matched)).toBe(true);
    expect(renderPromotionReport([report])).toBe(renderPromotionReport([report]));
  });

  it("keeps an accepted baseline range accepted when complete historical rows and runs are appended", () => {
    const fixture = acceptedFixture();
    const historicalDocument: DocumentRecord = {
      ...fixture.documents[0]!,
      sha256: "f".repeat(64),
      source_row_id: "historical-row",
      gazette_date: "2020/01/01",
      title: "Historical official publication",
    };
    const historicalRun: SweepRun = {
      ...fixture.sweeps[0]!,
      run_id: "historical-run",
      range_from: "2019-01-01",
      range_to: "2020-12-31",
      rows_seen: 1,
      pages_expected: 1,
      pages_fetched: 1,
      finished_at: "2026-07-20T00:00:00.000Z",
    };
    const report = assessSourcePromotion(
      SOURCE,
      [...fixture.documents, historicalDocument],
      [...fixture.sweeps, historicalRun],
      fixture.events,
    );

    expect(report).toMatchObject({
      status: "accepted",
      eligible: true,
      observed: {
        catalog_document_occurrences: 196,
        document_occurrences: 195,
        unique_blobs: 195,
      },
    });
    expect(report.observed.other_complete_runs.map((run) => run.run_id)).toEqual(["historical-run"]);
  });

  it("fails closed for missing, stale, partial, zero-row, and non-idempotent evidence", () => {
    const fixture = acceptedFixture();
    const stale = fixture.sweeps.map((run) => ({ ...run, range_to: "2026-07-15" }));
    expect(assessSourcePromotion(SOURCE, fixture.documents, stale, fixture.events)).toMatchObject({
      status: "provisional",
      eligible: false,
    });

    const partial: SweepRun = {
      ...fixture.sweeps[1]!,
      run_id: "run-3",
      finished_at: "2026-07-20T00:00:00.000Z",
      status: "partial",
      error: "interrupted",
    };
    expect(
      assessSourcePromotion(SOURCE, fixture.documents, [...fixture.sweeps, partial], fixture.events).reasons,
    ).toContain("unresolved failed or partial exact-range run(s): run-3");

    const additions: WatchdogEvent[] = [
      ...fixture.events,
      {
        event_id: "event-2",
        type: "new_document",
        source_id: "mh-egazette",
        run_id: "run-2",
        documents: ["f".repeat(64)],
        detail: "unexpected addition",
      },
    ];
    expect(assessSourcePromotion(SOURCE, fixture.documents, fixture.sweeps, additions).reasons).toEqual([
      "latest exact-range repeat run-2 emitted 1 new document occurrence(s)",
    ]);

    const empty = assessSourcePromotion(SOURCE, [], [], []);
    expect(empty.status).toBe("provisional");
    expect(empty.reasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/fewer than 2 exact-range complete runs/),
      "document occurrences are 0, expected 195",
      "unique document occurrences are 0, expected 195",
      "unique document blobs are 0, expected 195",
    ]));
  });

  it("keeps sources without a registered contract provisional", () => {
    const report = assessSourcePromotion(sourceById("gj-egazette"), [], [], []);
    expect(report).toMatchObject({
      requested: null,
      status: "provisional",
      eligible: false,
      reasons: ["no machine-checkable promotion requirement is registered"],
    });
  });

  it("does not promote new static sources from acquisition success alone", () => {
    for (const sourceId of [
      "ka-dpal-acts",
      "dl-revenue-notifications",
    ]) {
      const sweep: SweepRun = {
        run_id: `${sourceId}-complete`,
        source_id: sourceId,
        range_from: "2026-07-21",
        range_to: "2026-07-21",
        started_at: "2026-07-21T00:00:00.000Z",
        finished_at: "2026-07-21T01:00:00.000Z",
        status: "ok",
        rows_seen: 10,
        pages_expected: 2,
        pages_fetched: 2,
      };
      expect(assessSourcePromotion(sourceById(sourceId), [], [sweep], [])).toMatchObject({
        status: "provisional",
        eligible: false,
        requested: null,
        reasons: ["no machine-checkable promotion requirement is registered"],
      });
    }
  });
});

function acceptedFixture(): {
  documents: DocumentRecord[];
  sweeps: SweepRun[];
  events: WatchdogEvent[];
} {
  const documents = Array.from({ length: 195 }, (_, index): DocumentRecord => ({
    sha256: index.toString(16).padStart(64, "0"),
    source_id: "mh-egazette",
    source_row_id: `row-${index + 1}`,
    title: SENTINELS[index] ?? `Official publication ${index + 1}`,
    gazette_date: "2026/01/01",
    fetched_at: "2026-07-16T00:00:00.000Z",
    retrieval: { url: "https://egazzete.mahaonline.gov.in/Forms/GazetteSearch.aspx" },
    media_type: "application/pdf",
    ocr: null,
  }));
  const sweeps: SweepRun[] = ["run-1", "run-2"].map((runId, index) => ({
    run_id: runId,
    source_id: "mh-egazette",
    range_from: "2025-04-09",
    range_to: "2026-07-16",
    started_at: `2026-07-${16 + index}T00:00:00.000Z`,
    finished_at: `2026-07-${16 + index}T01:00:00.000Z`,
    status: "ok",
    rows_seen: 195,
    pages_expected: 2,
    pages_fetched: 2,
  }));
  const events: WatchdogEvent[] = [
    {
      event_id: "event-1",
      type: "new_document",
      source_id: "mh-egazette",
      run_id: "run-1",
      documents: documents.map((document) => document.sha256),
      detail: "initial acquisition",
    },
  ];
  return { documents, sweeps, events };
}
