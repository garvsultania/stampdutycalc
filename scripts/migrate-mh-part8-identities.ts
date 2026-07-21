import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { mhGazetteStableRowId, mhGazetteStableTitle } from "../packages/watchdog/src/mh-adapter.js";
import type { IdentityMigrationRecord } from "../packages/watchdog/src/catalog.js";
import type { DocumentRecord, SweepRun } from "../packages/watchdog/src/types.js";

const sourceRoot = resolve("watchdog-data");
const indexPath = join(sourceRoot, "index", "documents.jsonl");
const sweepsPath = join(sourceRoot, "state", "sweeps.jsonl");
const migrationPath = join(sourceRoot, "state", "identity-migrations.jsonl");
const baselineRunId = "b0146a92-8121-4195-9f44-8cff06a702d5";

const originalIndexBody = await readFile(indexPath);
const documents = jsonLines<DocumentRecord>(originalIndexBody.toString("utf8"));
const sweeps = jsonLines<SweepRun>(await readFile(sweepsPath, "utf8"));
const baseline = sweeps.find((run) => run.run_id === baselineRunId);
if (!baseline || baseline.status !== "ok" || baseline.rows_seen !== 195 || documents.length !== 195) {
  throw new Error(`Missing expected 195-row Part 8 baseline ${baselineRunId}`);
}

const occurrences = new Map<string, number>();
const migrated = documents.map((document) => {
  const stableTitle = mhGazetteStableTitle(document.title);
  const occurrence = occurrences.get(stableTitle) ?? 0;
  occurrences.set(stableTitle, occurrence + 1);
  return {
    ...document,
    source_row_id: mhGazetteStableRowId(stableTitle, occurrence),
  } satisfies DocumentRecord;
});
if (new Set(migrated.map((document) => document.source_row_id)).size !== migrated.length) {
  throw new Error("Part 8 stable identity migration did not produce one identity per occurrence");
}
if (migrated.every((document, index) => document.source_row_id === documents[index]!.source_row_id)) {
  throw new Error("Part 8 index already uses stable visible-row identities");
}

const migratedIndexBody = `${migrated.map((document) => JSON.stringify(document)).join("\n")}\n`;
const preMigrationDigest = createHash("sha256").update(originalIndexBody).digest("hex");
const postMigrationDigest = createHash("sha256").update(migratedIndexBody).digest("hex");
const migrationId = createHash("sha256").update(`${baselineRunId}:stable-visible-row-v1`).digest("hex");
const existingMigrations = await optionalJsonLines<IdentityMigrationRecord>(migrationPath);
if (existingMigrations.some((migration) => migration.migration_id === migrationId)) {
  throw new Error(`Part 8 identity migration already exists: ${migrationId}`);
}

const rollbackRoot = await mkdtemp(join(tmpdir(), "stampdraft-part8-id-migration-"));
const rollbackPath = join(rollbackRoot, "documents.jsonl");
await copyFile(indexPath, rollbackPath);
const temporaryIndex = `${indexPath}.migration.tmp`;
await writeFile(temporaryIndex, migratedIndexBody, { flag: "wx" });
await rename(temporaryIndex, indexPath);

const migration: IdentityMigrationRecord = {
  migration_id: migrationId,
  source_id: "mh-egazette",
  baseline_run_id: baselineRunId,
  strategy: "stable-visible-row-v1",
  before_occurrences: documents.length,
  after_occurrences: migrated.length,
  transient_form_state_removed: false,
  pre_migration_index_sha256: preMigrationDigest,
  post_migration_index_sha256: postMigrationDigest,
  backup_retained: false,
  audit_note: "A temporary rollback copy was created during the atomic migration but is not a durable backup. Both pre- and post-migration index digests are retained.",
  migrated_at: new Date().toISOString(),
};
await mkdir(dirname(migrationPath), { recursive: true });
const existingBody = existingMigrations.length === 0 ? "" : await readFile(migrationPath, "utf8");
const temporaryMigration = `${migrationPath}.migration.tmp`;
await writeFile(temporaryMigration, `${existingBody}${JSON.stringify(migration)}\n`, { flag: "wx" });
await rename(temporaryMigration, migrationPath);

process.stdout.write(`${JSON.stringify(migration)}\n`);
process.stderr.write(`Temporary rollback copy created at ${rollbackPath}; it is not part of the durable audit record.\n`);

function jsonLines<T>(body: string): T[] {
  return body.split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

async function optionalJsonLines<T>(path: string): Promise<T[]> {
  try {
    return jsonLines<T>(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
