import { createEvent, createRunId, EvidenceStore } from "./archive.js";
import { beginSearch, fetchNextPage, requirePdf } from "./egazette.js";
import { WatchdogError } from "./errors.js";
import type { EventType, Fetcher, SweepStatus } from "./types.js";

export interface SweepOptions {
  from: string;
  to: string;
  limit?: number;
}

export interface SweepDependencies {
  fetcher: Fetcher;
  evidence: EvidenceStore;
  runId?: () => string;
  now?: () => string;
}

export interface SweepReport {
  status: SweepStatus;
  rows: number;
  pagesFetched: number;
  pagesExpected?: number;
  documentsFetched: number;
  newBlobs: number;
  newDocuments: string[];
  error?: string;
}

export async function runMhEgazetteSweep(
  options: SweepOptions,
  dependencies: SweepDependencies,
): Promise<SweepReport> {
  const { fetcher, evidence } = dependencies;
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1)) {
    throw new WatchdogError("Sweep limit must be a positive integer", "shape_drift");
  }
  const now = dependencies.now ?? (() => new Date().toISOString());
  const runId = (dependencies.runId ?? createRunId)();
  const startedAt = now();
  let rowsSeen = 0;
  let pagesFetched = 0;
  let pagesExpected: number | undefined;
  let documentsFetched = 0;
  let newBlobs = 0;
  const newDocuments: string[] = [];

  try {
    const session = await beginSearch(fetcher, options);
    const rows = [...session.firstPage.rows];
    let page = session.firstPage;
    rowsSeen = rows.length;
    pagesFetched = page.pageNumber;
    pagesExpected = page.pagesExpected;
    while (page.nextPostBack) {
      const next = await fetchNextPage(fetcher, page, session.searchFormValues);
      page = next.page;
      pagesFetched = page.pageNumber;
      pagesExpected = page.pagesExpected;
      rows.push(...page.rows);
      rowsSeen = rows.length;
    }
    const uniqueRows = new Set(rows.map((row) => row.sourceRowId));
    if (uniqueRows.size !== rows.length) {
      throw new WatchdogError(
        `e-Gazette returned ${rows.length} rows but only ${uniqueRows.size} distinct source rows`,
        "shape_drift",
      );
    }
    await evidence.refreshDocumentMetadata(rows);
    const documents = options.limit === undefined ? rows : rows.slice(0, options.limit);
    for (const [index, row] of documents.entries()) {
      const response = await fetcher.request(row.pdfRequest);
      requirePdf(response, `e-Gazette document ${index + 1}`);
      const archived = await evidence.archive(row, response.body, response.mediaType, now());
      if (archived.newBlob) newBlobs++;
      if (archived.newDocument) newDocuments.push(archived.document.sha256);
      documentsFetched++;
    }
    const status = documentsFetched === rowsSeen ? "ok" : "partial";
    const error = status === "partial" ? `Bounded sweep fetched ${documentsFetched} of ${rowsSeen} listed documents` : undefined;
    await evidence.recordSweep({
      run_id: runId,
      source_id: "mh-egazette",
      range_from: options.from,
      range_to: options.to,
      started_at: startedAt,
      finished_at: now(),
      status,
      rows_seen: rowsSeen,
      pages_expected: pagesExpected,
      pages_fetched: pagesFetched,
      ...(error ? { error } : {}),
    });
    if (newDocuments.length > 0) {
      await evidence.emitEvent(
        createEvent(runId, "new_document", `${newDocuments.length} new e-Gazette documents archived`, newDocuments),
      );
    }
    if (error) await evidence.emitEvent(createEvent(runId, "sweep_partial", error));
    return {
      status,
      rows: rowsSeen,
      pagesFetched,
      ...(pagesExpected === undefined ? {} : { pagesExpected }),
      documentsFetched,
      newBlobs,
      newDocuments,
      ...(error ? { error } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = rowsSeen > 0 || pagesFetched > 0 || documentsFetched > 0 ? "partial" : "failed";
    const eventType: EventType =
      status === "partial"
        ? "sweep_partial"
        : error instanceof WatchdogError && error.kind !== "partial"
          ? error.kind
          : "source_unreachable";
    await evidence.recordSweep({
      run_id: runId,
      source_id: "mh-egazette",
      range_from: options.from,
      range_to: options.to,
      started_at: startedAt,
      finished_at: now(),
      status,
      rows_seen: rowsSeen,
      ...(pagesExpected === undefined ? {} : { pages_expected: pagesExpected }),
      ...(pagesFetched > 0 ? { pages_fetched: pagesFetched } : {}),
      error: message,
    });
    await evidence.emitEvent(createEvent(runId, eventType, message));
    throw new SweepFailedError(
      message,
      {
        status,
        rows: rowsSeen,
        pagesFetched,
        ...(pagesExpected === undefined ? {} : { pagesExpected }),
        documentsFetched,
        newBlobs,
        newDocuments,
        error: message,
      },
      error,
    );
  }
}

export class SweepFailedError extends Error {
  constructor(
    message: string,
    readonly report: SweepReport,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SweepFailedError";
  }
}
