export const SOURCE_ID = "mh-egazette" as const;
export type SourceId = string;

export interface ResponseRecord {
  url: string;
  status: number;
  mediaType: string;
  body: Uint8Array;
  headers: Record<string, string>;
  request: {
    method: string;
    url: string;
    formValues?: Record<string, string>;
  };
}

export interface RequestSpec {
  url: string;
  method?: "GET" | "POST";
  formValues?: Record<string, string>;
}

export interface Fetcher {
  request(spec: RequestSpec): Promise<ResponseRecord>;
}

export interface RecordedResponseMeta {
  sequence: number;
  request: ResponseRecord["request"];
  response: {
    url: string;
    status: number;
    media_type: string;
    headers: Record<string, string>;
    body_file: string;
    bytes: number;
  };
}

export interface GazetteRow {
  sourceRowId: string;
  cells: string[];
  title: string;
  gazetteDate?: string;
  pdfTarget: string;
  pdfRequest: RequestSpec;
  retrieval: {
    form_values: Record<string, string>;
  };
}

export interface GazettePage {
  rows: GazetteRow[];
  pageNumber: number;
  pagesExpected?: number;
  nextPostBack?: { eventTarget: string; eventArgument: string };
  hiddenFields: Record<string, string>;
  formAction: string;
}

export type SweepStatus = "ok" | "failed" | "partial";
export type EventType =
  | "new_document"
  | "document_acquired"
  | "source_unreachable"
  | "shape_drift"
  | "sweep_partial";

export interface DocumentRecord {
  sha256: string;
  source_id: SourceId;
  source_row_id: string;
  title: string;
  gazette_date?: string;
  fetched_at: string;
  retrieval: {
    url: string;
    form_values?: Record<string, string>;
  };
  media_type: string;
  ocr: { status: "not_needed" | "ok" | "failed"; lang?: string } | null;
}

export interface SweepRun {
  run_id: string;
  source_id: SourceId;
  range_from: string;
  range_to: string;
  started_at: string;
  finished_at: string;
  status: SweepStatus;
  rows_seen: number;
  pages_expected?: number;
  pages_fetched?: number;
  error?: string;
}

export interface WatchdogEvent {
  event_id: string;
  type: EventType;
  source_id: SourceId;
  run_id: string;
  documents?: string[];
  detail: string;
}

export interface OccurrenceHistoryRecord {
  history_id: string;
  source_id: SourceId;
  source_row_id: string;
  run_id: string;
  observed_at: string;
  sha256: string;
  transient_form_state_removed: boolean;
  before: OccurrenceMetadata;
  after: OccurrenceMetadata;
}

export interface OccurrenceMetadata {
  title: string;
  gazette_date: string | null;
  retrieval: DocumentRecord["retrieval"];
}
