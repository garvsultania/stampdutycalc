import { createHash } from "node:crypto";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { mhGazetteStableRowId, mhGazetteStableTitle } from "../packages/watchdog/src/mh-adapter.js";
import type { DocumentRecord, SweepRun } from "../packages/watchdog/src/types.js";

const sourceRoot = resolve("watchdog-data", "sources", "mh-egazette-part4b");
const indexPath = join(sourceRoot, "index", "documents.jsonl");
const sweepsPath = join(sourceRoot, "state", "sweeps.jsonl");
const migrationPath = join(sourceRoot, "state", "identity-migrations.jsonl");
const baselineRunId = "733e0685-4826-499c-bc91-6a1803c69392";
const carriedRowSha256 = "8931ab80139f05aeef7692bd2d0f3b88b5242f158ab4d5146186ce745738cb03";

const originalIndexBody = await readFile(indexPath);
const documents = await jsonLines<DocumentRecord>(indexPath);
const sweeps = await jsonLines<SweepRun>(sweepsPath);
const baselineRun = sweeps.find((run) => run.run_id === baselineRunId);
if (!baselineRun || baselineRun.status !== "ok" || baselineRun.rows_seen !== 2575) {
  throw new Error(`Missing expected complete baseline run ${baselineRunId}`);
}

const acquiredInRun = documents.filter(
  (document) =>
    document.fetched_at >= baselineRun.started_at && document.fetched_at <= baselineRun.finished_at,
);
const carriedRow = documents.find(
  (document) => document.sha256 === carriedRowSha256 && document.fetched_at < baselineRun.started_at,
);
if (!carriedRow || acquiredInRun.length !== 2574) {
  throw new Error(`Expected 2,574 run acquisitions plus one carried row; got ${acquiredInRun.length} plus ${carriedRow ? 1 : 0}`);
}

const baseline = [...acquiredInRun, carriedRow].sort((left, right) => serial(left.title) - serial(right.title));
const occurrences = new Map<string, number>();
const migrated = baseline.map((document) => {
  const stableTitle = mhGazetteStableTitle(document.title);
  const occurrence = occurrences.get(stableTitle) ?? 0;
  occurrences.set(stableTitle, occurrence + 1);
  return {
    ...document,
    source_row_id: mhGazetteStableRowId(stableTitle, occurrence),
    retrieval: {
      url: document.retrieval.url,
      ...(document.retrieval.form_values
        ? { form_values: archivalFormValues(document.retrieval.form_values) }
        : {}),
    },
  } satisfies DocumentRecord;
});
if (new Set(migrated.map((document) => document.source_row_id)).size !== baselineRun.rows_seen) {
  throw new Error("Stable identity migration did not produce one identity per baseline row");
}

const backupDir = await mkdtemp(join(tmpdir(), "stampdraft-part4b-id-migration-"));
const backupPath = join(backupDir, "documents.jsonl");
await copyFile(indexPath, backupPath);
const temporary = `${indexPath}.migration.tmp`;
const migratedIndexBody = `${migrated.map((document) => JSON.stringify(document)).join("\n")}\n`;
await mkdir(dirname(indexPath), { recursive: true });
await writeFile(temporary, migratedIndexBody, { flag: "wx" });
await rename(temporary, indexPath);

const migration = {
  migration_id: createHash("sha256").update(`${baselineRunId}:stable-visible-row-v1`).digest("hex"),
  source_id: "mh-egazette-part4b",
  baseline_run_id: baselineRunId,
  strategy: "stable-visible-row-v1",
  before_occurrences: documents.length,
  after_occurrences: migrated.length,
  transient_form_state_removed: true,
  pre_migration_index_sha256: createHash("sha256").update(originalIndexBody).digest("hex"),
  post_migration_index_sha256: createHash("sha256").update(migratedIndexBody).digest("hex"),
  backup_retained: false,
  migrated_at: new Date().toISOString(),
};
await appendFile(migrationPath, `${JSON.stringify(migration)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(migration)}\n`);
process.stderr.write(`Temporary rollback copy created at ${backupPath}; it is not part of the durable audit record.\n`);

function serial(title: string): number {
  const value = Number(/^\s*(\d+)\s*\|/.exec(title)?.[1]);
  if (!Number.isSafeInteger(value)) throw new Error(`Document title has no serial number: ${title}`);
  return value;
}

function archivalFormValues(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter(([name]) =>
      name === "__EVENTTARGET" ||
      name === "__EVENTARGUMENT" ||
      /\$(?:ddlDivision|ddlSection|ddlGazetteType|txtFromDate|txtToDate)$/i.test(name)
    ),
  );
}

async function jsonLines<T>(path: string): Promise<T[]> {
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
