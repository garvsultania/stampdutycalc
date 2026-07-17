import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { WatchdogError } from "./errors.js";
import { SOURCE_ID, type DocumentRecord, type GazetteRow, type SourceId, type SweepRun, type WatchdogEvent } from "./types.js";

export interface ArchiveResult {
  document: DocumentRecord;
  newBlob: boolean;
  newDocument: boolean;
}

export class EvidenceStore {
  readonly root: string;

  constructor(
    root: string,
    readonly sourceId: SourceId = SOURCE_ID,
  ) {
    this.root = resolve(root);
    guardArchivePath(this.root);
  }

  async archive(row: GazetteRow, body: Uint8Array, mediaType: string, fetchedAt: string): Promise<ArchiveResult> {
    const sha256 = createHash("sha256").update(body).digest("hex");
    const blobPath = join(this.root, "blobs", sha256.slice(0, 2), `${sha256}.pdf`);
    const newBlob = await writeImmutableBlob(blobPath, body, sha256);
    const document = documentRecord(this.sourceId, row, sha256, mediaType, fetchedAt);
    const newDocument = await appendUnique(join(this.root, "index", "documents.jsonl"), "sha256", document);
    return { document, newBlob, newDocument };
  }

  async refreshDocumentMetadata(rows: GazetteRow[]): Promise<number> {
    const path = join(this.root, "index", "documents.jsonl");
    const documents = await readJsonLines<DocumentRecord>(path);
    if (documents.length === 0) return 0;
    const rowsById = new Map(rows.map((row) => [row.sourceRowId, row]));
    let updated = 0;
    const refreshed = documents.map((document) => {
      const row = rowsById.get(document.source_row_id);
      if (!row) return document;
      const next = documentRecord(this.sourceId, row, document.sha256, document.media_type, document.fetched_at);
      next.ocr = document.ocr;
      if (JSON.stringify(next) !== JSON.stringify(document)) updated++;
      return next;
    });
    if (updated > 0) await writeJsonLinesAtomically(path, refreshed);
    return updated;
  }

  async recordSweep(run: SweepRun): Promise<void> {
    await appendFileJson(join(this.root, "state", "sweeps.jsonl"), run);
  }

  async emitEvent(event: WatchdogEvent): Promise<boolean> {
    return appendUnique(join(this.root, "state", "events.jsonl"), "event_id", event);
  }
}

function documentRecord(
  sourceId: SourceId,
  row: GazetteRow,
  sha256: string,
  mediaType: string,
  fetchedAt: string,
): DocumentRecord {
  return {
    sha256,
    source_id: sourceId,
    source_row_id: row.sourceRowId,
    title: row.title,
    ...(row.gazetteDate ? { gazette_date: row.gazetteDate } : {}),
    fetched_at: fetchedAt,
    retrieval: {
      url: row.pdfRequest.url,
      ...(row.pdfRequest.formValues ? { form_values: row.pdfRequest.formValues } : {}),
    },
    media_type: mediaType,
    ocr: null,
  };
}

export function createRunId(): string {
  return randomUUID();
}

export function createEvent(
  runId: string,
  type: WatchdogEvent["type"],
  detail: string,
  documents?: string[],
  sourceId: SourceId = SOURCE_ID,
): WatchdogEvent {
  const identity =
    type === "new_document"
      ? JSON.stringify({ source: sourceId, type, detail, documents: documents ?? [] })
      : JSON.stringify({ source: sourceId, runId, type, detail, documents: documents ?? [] });
  return {
    event_id: createHash("sha256").update(identity).digest("hex"),
    type,
    source_id: sourceId,
    run_id: runId,
    ...(documents && documents.length > 0 ? { documents } : {}),
    detail,
  };
}

async function writeImmutableBlob(path: string, body: Uint8Array, expectedHash: string): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true });
  try {
    await stat(path);
    const existing = await readFile(path);
    const existingHash = createHash("sha256").update(existing).digest("hex");
    if (existingHash !== expectedHash) {
      throw new WatchdogError(`Immutable blob collision at ${path}`, "shape_drift");
    }
    return false;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  await writeFile(path, body, { flag: "wx" });
  return true;
}

async function appendUnique<T extends object>(path: string, identityKey: keyof T, value: T): Promise<boolean> {
  const existing = await readJsonLines<T>(path);
  if (existing.some((entry) => entry[identityKey] === value[identityKey])) return false;
  await appendFileJson(path, value);
  return true;
}

async function appendFileJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

async function readJsonLines<T>(path: string): Promise<T[]> {
  try {
    const data = await readFile(path, "utf8");
    return data
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJsonLinesAtomically(path: string, values: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`, { flag: "wx" });
  await rename(temporary, path);
}

function guardArchivePath(path: string): void {
  const absolute = isAbsolute(path) ? path : resolve(path);
  const parts = relative(resolve(sep), absolute).split(sep);
  if (parts.includes("rules")) {
    throw new WatchdogError(`Watchdog evidence store cannot target rules/: ${absolute}`, "shape_drift");
  }
}
