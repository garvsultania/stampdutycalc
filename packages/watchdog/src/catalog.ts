import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { WatchdogError } from "./errors.js";
import { assessSourcePromotion, type SourcePromotionReport } from "./promotion.js";
import { listSources, type SourceDefinition, type SourceStatus } from "./sources.js";
import type { DocumentRecord, OccurrenceHistoryRecord, SweepRun, WatchdogEvent } from "./types.js";

export interface WatchdogEvidenceCatalog {
  documents: DocumentRecord[];
  sweeps: SweepRun[];
  events: WatchdogEvent[];
  identityMigrations: IdentityMigrationRecord[];
  occurrenceHistory: OccurrenceHistoryRecord[];
  promotions: SourcePromotionReport[];
  sources: readonly CatalogSourceDefinition[];
}

export interface CatalogSourceDefinition extends SourceDefinition {
  /** Generated exclusively from the machine-checkable promotion report. */
  status: SourceStatus;
}

export interface IdentityMigrationRecord {
  migration_id: string;
  source_id: string;
  baseline_run_id: string;
  strategy: string;
  before_occurrences: number;
  after_occurrences: number;
  transient_form_state_removed: boolean;
  pre_migration_index_sha256: string | null;
  post_migration_index_sha256: string;
  backup_retained: boolean;
  audit_note?: string;
  migrated_at: string;
}

/** Load every committed evidence index/state shard under watchdog-data/. Probe
 * records and response recordings are deliberately excluded: neither proves an
 * immutable document acquisition nor a complete audit sweep. */
export function loadEvidenceCatalog(rawRoot: string): WatchdogEvidenceCatalog {
  const root = resolve(rawRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new WatchdogError(`Evidence catalog root is not a directory: ${root}`, "shape_drift");
  }

  const documents: DocumentRecord[] = [];
  const sweeps: SweepRun[] = [];
  const events: WatchdogEvent[] = [];
  const identityMigrations: IdentityMigrationRecord[] = [];
  const occurrenceHistory: OccurrenceHistoryRecord[] = [];
  for (const file of walk(root)) {
    if (file.endsWith("/index/documents.jsonl")) {
      documents.push(...readJsonLines(file, isDocumentRecord));
    } else if (file.endsWith("/state/sweeps.jsonl")) {
      sweeps.push(...readJsonLines(file, isSweepRun));
    } else if (file.endsWith("/state/events.jsonl")) {
      events.push(...readJsonLines(file, isWatchdogEvent));
    } else if (file.endsWith("/state/identity-migrations.jsonl")) {
      identityMigrations.push(...readIdentityMigrations(file));
    } else if (file.endsWith("/state/occurrence-history.jsonl")) {
      occurrenceHistory.push(...readJsonLines(file, isOccurrenceHistoryRecord));
    }
  }

  // One PDF may legitimately be published by multiple official source families.
  // Provenance identity is the source occurrence, while the blob stays hash-deduped.
  assertUnique(
    documents,
    (document) => `${document.source_id}\u0000${document.source_row_id}`,
    "document source occurrence",
  );
  assertUnique(sweeps, (sweep) => sweep.run_id, "sweep run_id");
  assertUnique(events, (event) => event.event_id, "event_id");
  assertUnique(identityMigrations, (migration) => migration.migration_id, "identity migration_id");
  assertUnique(occurrenceHistory, (record) => record.history_id, "occurrence history_id");
  const declaredSources = listSources();
  const promotions = declaredSources.map((source) => assessSourcePromotion(source, documents, sweeps, events));
  const sources = declaredSources.map((source, index) => ({
    ...source,
    status: promotions[index]!.status,
  }));
  return { documents, sweeps, events, identityMigrations, occurrenceHistory, promotions, sources };
}

function readIdentityMigrations(file: string): IdentityMigrationRecord[] {
  const migrations = readJsonLines(file, isIdentityMigrationRecord);
  const indexPath = join(dirname(dirname(file)), "index", "documents.jsonl");
  if (!existsSync(indexPath)) {
    throw new WatchdogError(`Identity migration has no document index: ${file}`, "shape_drift");
  }
  const currentBody = readFileSync(indexPath);
  const currentOccurrences = currentBody.toString("utf8").split("\n").filter(Boolean).length;
  const currentDigest = createHash("sha256").update(currentBody).digest("hex");
  for (const migration of migrations) {
    // A later sweep may legitimately append occurrences. When the occurrence
    // count is still exactly the migrated baseline, the committed index must be
    // byte-for-byte the migration result.
    if (
      currentOccurrences === migration.after_occurrences &&
      currentDigest !== migration.post_migration_index_sha256
    ) {
      throw new WatchdogError(
        `Identity migration ${migration.migration_id} post-migration index digest does not match ${indexPath}`,
        "shape_drift",
      );
    }
  }
  return migrations;
}

function walk(root: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root).sort()) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else if (stat.isFile()) files.push(path);
  }
  return files;
}

function readJsonLines<T>(file: string, guard: (value: unknown) => value is T): T[] {
  const out: T[] = [];
  for (const [index, line] of readFileSync(file, "utf8").split("\n").entries()) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new WatchdogError(
        `Invalid JSON in ${file}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        "shape_drift",
      );
    }
    if (!guard(value)) {
      throw new WatchdogError(`Invalid evidence record in ${file}:${index + 1}`, "shape_drift");
    }
    out.push(value);
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDocumentRecord(value: unknown): value is DocumentRecord {
  return (
    isRecord(value) &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    typeof value.source_id === "string" &&
    typeof value.source_row_id === "string" &&
    typeof value.title === "string" &&
    typeof value.fetched_at === "string"
  );
}

function isSweepRun(value: unknown): value is SweepRun {
  return (
    isRecord(value) &&
    typeof value.run_id === "string" &&
    typeof value.source_id === "string" &&
    typeof value.range_from === "string" &&
    typeof value.range_to === "string" &&
    (value.status === "ok" || value.status === "failed" || value.status === "partial")
  );
}

function isWatchdogEvent(value: unknown): value is WatchdogEvent {
  return (
    isRecord(value) &&
    typeof value.event_id === "string" &&
    typeof value.source_id === "string" &&
    typeof value.run_id === "string" &&
    typeof value.type === "string" &&
    typeof value.detail === "string"
  );
}

function isIdentityMigrationRecord(value: unknown): value is IdentityMigrationRecord {
  return (
    isRecord(value) &&
    typeof value.migration_id === "string" &&
    /^[a-f0-9]{64}$/.test(value.migration_id) &&
    typeof value.source_id === "string" &&
    typeof value.baseline_run_id === "string" &&
    typeof value.strategy === "string" &&
    typeof value.before_occurrences === "number" &&
    Number.isSafeInteger(value.before_occurrences) &&
    typeof value.after_occurrences === "number" &&
    Number.isSafeInteger(value.after_occurrences) &&
    typeof value.transient_form_state_removed === "boolean" &&
    (value.pre_migration_index_sha256 === null ||
      (typeof value.pre_migration_index_sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(value.pre_migration_index_sha256))) &&
    typeof value.post_migration_index_sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.post_migration_index_sha256) &&
    typeof value.backup_retained === "boolean" &&
    (value.audit_note === undefined || typeof value.audit_note === "string") &&
    typeof value.migrated_at === "string"
  );
}

function isOccurrenceHistoryRecord(value: unknown): value is OccurrenceHistoryRecord {
  return (
    isRecord(value) &&
    typeof value.history_id === "string" &&
    /^[a-f0-9]{64}$/.test(value.history_id) &&
    typeof value.source_id === "string" &&
    typeof value.source_row_id === "string" &&
    typeof value.run_id === "string" &&
    typeof value.observed_at === "string" &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    typeof value.transient_form_state_removed === "boolean" &&
    isRecord(value.before) &&
    isRecord(value.after)
  );
}

function assertUnique<T>(items: readonly T[], key: (item: T) => string, label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) throw new WatchdogError(`Duplicate ${label} in evidence catalog: ${value}`, "shape_drift");
    seen.add(value);
  }
}
