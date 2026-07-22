import type { SourceDefinition, SourceStatus } from "./sources.js";
import type { DocumentRecord, SweepRun, WatchdogEvent } from "./types.js";

export interface PromotionRunReport {
  run_id: string;
  range_from: string;
  range_to: string;
  finished_at: string;
  status: SweepRun["status"];
  rows: number;
  pages_fetched: number | null;
  pages_expected: number | null;
  new_document_occurrences: number;
  recovered: boolean;
  error: string | null;
}

export interface PromotionSentinelReport {
  id: string;
  matched: boolean;
  source_row_id: string | null;
  sha256: string | null;
  title: string | null;
}

export interface SourcePromotionReport {
  schema_version: 1;
  source_id: string;
  status: SourceStatus;
  eligible: boolean;
  reasons: string[];
  requested: {
    range_from: string;
    range_to: string;
    rows: number;
    pages: number;
    unique_blobs: number;
    repeat_runs: number;
  } | null;
  observed: {
    catalog_document_occurrences: number;
    document_occurrences: number;
    unique_occurrences: number;
    unique_blobs: number;
    complete_runs: PromotionRunReport[];
    incomplete_runs: PromotionRunReport[];
    other_complete_runs: PromotionRunReport[];
    latest_repeat_additions: number | null;
    sentinels: PromotionSentinelReport[];
  };
  required_fixture_tests: string[];
}

interface SentinelRequirement {
  id: string;
  title?: RegExp;
  sha256?: string;
}

interface PromotionRequirement {
  rangeFrom: string;
  rangeTo: string;
  rows: number;
  pages: number;
  uniqueBlobs: number;
  repeatRuns: number;
  sentinels: SentinelRequirement[];
  fixtureTests: string[];
}

const MH_FIXTURE_TESTS = [
  "packages/watchdog/src/egazette.test.ts (recorded replay and parser fail-closed fixtures)",
  "packages/watchdog/src/sweep.test.ts (zero-addition replay, interruption, and shape-drift fixtures)",
] as const;

const REQUIREMENTS: Record<string, PromotionRequirement> = {
  "mh-egazette-part8": {
    rangeFrom: "2025-04-09",
    rangeTo: "2026-07-16",
    rows: 195,
    pages: 2,
    uniqueBlobs: 195,
    repeatRuns: 2,
    sentinels: [
      { id: "mh-act-lxiii-2025", title: /MAHARASHTRA ACT No\. LXIII OF 2025/i },
      { id: "mh-act-xiii-2026", title: /MAHARASHTRA ACT No\. XIII OF 2026/i },
      { id: "mh-act-xvi-2026", title: /MAHARASHTRA ACT No\. XVI OF 2026/i },
      { id: "mh-act-xxix-2026", title: /MAHARASHTRA ACT No\. XXIX OF 2026/i },
    ],
    fixtureTests: [...MH_FIXTURE_TESTS, "packages/watchdog/src/evidence.test.ts (sanitized replay sequence)"],
  },
  "mh-egazette-part4b": {
    rangeFrom: "2021-07-17",
    rangeTo: "2026-07-19",
    rows: 2_575,
    pages: 26,
    uniqueBlobs: 2_547,
    repeatRuns: 2,
    sentinels: [
      {
        id: "mh-mudrank-2024-cr182",
        sha256: "1d2695a0be9714d2cc94e9218e9ce4fdff28a12e0968fae0dda9aad4e835d07f",
      },
    ],
    fixtureTests: [...MH_FIXTURE_TESTS, "packages/watchdog/src/mh-part4b-evidence.test.ts (direct evidence audit)"],
  },
};

/** Machine-check the committed facts that justify an accepted source. Source
 * definitions deliberately contain no acceptance status; this generated report
 * is the sole authority used by the evidence catalog. */
export function assessSourcePromotion(
  source: SourceDefinition,
  documents: readonly DocumentRecord[],
  sweeps: readonly SweepRun[],
  events: readonly WatchdogEvent[],
): SourcePromotionReport {
  const requirement = REQUIREMENTS[source.id];
  const evidenceIds = new Set([source.id, ...(source.evidence_ids ?? [])]);
  const sourceDocuments = documents
    .filter((document) => evidenceIds.has(document.source_id))
    .sort((left, right) => occurrenceId(left).localeCompare(occurrenceId(right)));
  const sourceSweeps = sweeps
    .filter((sweep) => evidenceIds.has(sweep.source_id))
    .sort((left, right) => left.finished_at.localeCompare(right.finished_at) || left.run_id.localeCompare(right.run_id));

  if (!requirement) {
    const reasons = ["no machine-checkable promotion requirement is registered"];
    return {
      schema_version: 1,
      source_id: source.id,
      status: "provisional",
      eligible: false,
      reasons,
      requested: null,
      observed: {
        catalog_document_occurrences: sourceDocuments.length,
        document_occurrences: sourceDocuments.length,
        unique_occurrences: new Set(sourceDocuments.map(occurrenceId)).size,
        unique_blobs: new Set(sourceDocuments.map((document) => document.sha256)).size,
        complete_runs: [],
        incomplete_runs: sourceSweeps.map((sweep) => runReport(sweep, events, false)),
        other_complete_runs: [],
        latest_repeat_additions: null,
        sentinels: [],
      },
      required_fixture_tests: [],
    };
  }

  const rangeDocuments = sourceDocuments.filter((document) =>
    publicationDateInRange(document.gazette_date, requirement.rangeFrom, requirement.rangeTo)
  );

  const exactRangeRuns = sourceSweeps.filter(
    (sweep) => sweep.range_from === requirement.rangeFrom && sweep.range_to === requirement.rangeTo,
  );
  const qualifyingRuns = exactRangeRuns.filter(
    (sweep) =>
      sweep.status === "ok" &&
      sweep.rows_seen === requirement.rows &&
      sweep.pages_fetched === requirement.pages &&
      sweep.pages_expected === requirement.pages,
  );
  const latestComplete = qualifyingRuns.at(-1);
  const incompleteRuns = sourceSweeps.filter(
    (sweep) => !qualifyingRuns.includes(sweep) && sweep.status !== "ok",
  );
  const otherCompleteRuns = sourceSweeps.filter(
    (sweep) => !qualifyingRuns.includes(sweep) && sweep.status === "ok",
  );
  const completeReports = qualifyingRuns.map((sweep) => runReport(sweep, events, false));
  const incompleteReports = incompleteRuns.map((sweep) =>
    runReport(sweep, events, recoveredByLaterComplete(sweep, sourceSweeps))
  );
  const otherCompleteReports = otherCompleteRuns.map((sweep) => runReport(sweep, events, false));
  const latestRepeatAdditions = completeReports.at(-1)?.new_document_occurrences ?? null;
  const sentinelReports = requirement.sentinels.map((sentinel) => {
    const match = rangeDocuments.find(
      (document) =>
        (sentinel.sha256 === undefined || document.sha256 === sentinel.sha256) &&
        (sentinel.title === undefined || sentinel.title.test(document.title)),
    );
    return {
      id: sentinel.id,
      matched: match !== undefined,
      source_row_id: match?.source_row_id ?? null,
      sha256: match?.sha256 ?? null,
      title: match?.title ?? null,
    };
  });

  const reasons: string[] = [];
  if (qualifyingRuns.length < requirement.repeatRuns) {
    reasons.push(
      `fewer than ${requirement.repeatRuns} exact-range complete runs satisfy the ${requirement.rows}-row/${requirement.pages}-page contract`,
    );
  }
  if (rangeDocuments.length !== requirement.rows) {
    reasons.push(`document occurrences are ${rangeDocuments.length}, expected ${requirement.rows}`);
  }
  const uniqueOccurrences = new Set(rangeDocuments.map(occurrenceId)).size;
  if (uniqueOccurrences !== requirement.rows) {
    reasons.push(`unique document occurrences are ${uniqueOccurrences}, expected ${requirement.rows}`);
  }
  const uniqueBlobs = new Set(rangeDocuments.map((document) => document.sha256)).size;
  if (uniqueBlobs !== requirement.uniqueBlobs) {
    reasons.push(`unique document blobs are ${uniqueBlobs}, expected ${requirement.uniqueBlobs}`);
  }
  for (const sentinel of sentinelReports) {
    if (!sentinel.matched) reasons.push(`required sentinel is absent: ${sentinel.id}`);
  }
  if (qualifyingRuns.length >= requirement.repeatRuns && latestRepeatAdditions !== 0) {
    reasons.push(
      `latest exact-range repeat ${latestComplete!.run_id} emitted ${latestRepeatAdditions} new document occurrence(s)`,
    );
  }
  const unresolved = incompleteRuns.filter(
    (sweep) =>
      sweep.range_from === requirement.rangeFrom &&
      sweep.range_to === requirement.rangeTo &&
      (latestComplete === undefined || sweep.finished_at > latestComplete.finished_at),
  );
  if (unresolved.length > 0) {
    reasons.push(`unresolved failed or partial exact-range run(s): ${unresolved.map((run) => run.run_id).join(", ")}`);
  }

  const eligible = reasons.length === 0;
  return {
    schema_version: 1,
    source_id: source.id,
    status: eligible ? "accepted" : "provisional",
    eligible,
    reasons,
    requested: {
      range_from: requirement.rangeFrom,
      range_to: requirement.rangeTo,
      rows: requirement.rows,
      pages: requirement.pages,
      unique_blobs: requirement.uniqueBlobs,
      repeat_runs: requirement.repeatRuns,
    },
    observed: {
      catalog_document_occurrences: sourceDocuments.length,
      document_occurrences: rangeDocuments.length,
      unique_occurrences: uniqueOccurrences,
      unique_blobs: uniqueBlobs,
      complete_runs: completeReports,
      incomplete_runs: incompleteReports,
      other_complete_runs: otherCompleteReports,
      latest_repeat_additions: latestRepeatAdditions,
      sentinels: sentinelReports,
    },
    required_fixture_tests: [...requirement.fixtureTests],
  };
}

export function renderPromotionReport(reports: readonly SourcePromotionReport[]): string {
  return `${JSON.stringify({ schema_version: 1, sources: reports }, null, 2)}\n`;
}

function occurrenceId(document: DocumentRecord): string {
  return `${document.source_id}\u0000${document.source_row_id}`;
}

function publicationDateInRange(value: string | undefined, from: string, to: string): boolean {
  if (value === undefined) return false;
  const normalized = value.replaceAll("/", "-");
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && normalized >= from && normalized <= to;
}

function recoveredByLaterComplete(run: SweepRun, sweeps: readonly SweepRun[]): boolean {
  return sweeps.some((candidate) =>
    candidate.status === "ok" &&
    candidate.finished_at > run.finished_at &&
    candidate.range_from <= run.range_from &&
    candidate.range_to >= run.range_to
  );
}

function runReport(
  sweep: SweepRun,
  events: readonly WatchdogEvent[],
  recovered: boolean,
): PromotionRunReport {
  const additions = events
    .filter((event) => event.run_id === sweep.run_id && event.type === "new_document")
    .reduce((total, event) => total + (event.documents?.length ?? 0), 0);
  return {
    run_id: sweep.run_id,
    range_from: sweep.range_from,
    range_to: sweep.range_to,
    finished_at: sweep.finished_at,
    status: sweep.status,
    rows: sweep.rows_seen,
    pages_fetched: sweep.pages_fetched ?? null,
    pages_expected: sweep.pages_expected ?? null,
    new_document_occurrences: additions,
    recovered,
    error: sweep.error ?? null,
  };
}
