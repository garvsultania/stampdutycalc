import { createHash } from "node:crypto";
import { canonicalJson } from "@stampdraft/engine";
import type { Db, DbSession } from "./db.js";
import { migrate } from "./db.js";
import { getMigrationState, STORE_SCHEMA_VERSION } from "./migrations.js";

export interface DatabaseBackupProvider {
  readonly id: string;
  readonly kind: "external" | "test";
  readonly capabilities: {
    encryptedAtRest: boolean;
    offDevice: boolean;
  };
  checkHealth(): Promise<boolean>;
  putObject(objectKey: string, bytes: Uint8Array): Promise<void>;
  getObject(objectKey: string): Promise<Uint8Array | null>;
}

let configuredProvider: DatabaseBackupProvider | null = null;
let verifiedRestoreDrill: { provider: string; verifiedAt: string; dataSha256: string } | null = null;

export function installDatabaseBackupProvider(provider: DatabaseBackupProvider): () => void {
  const previous = configuredProvider;
  const previousDrill = verifiedRestoreDrill;
  configuredProvider = provider;
  verifiedRestoreDrill = null;
  return () => {
    configuredProvider = previous;
    verifiedRestoreDrill = previousDrill;
  };
}

export function getDatabaseBackupProvider(): DatabaseBackupProvider | null {
  return configuredProvider;
}

export function isProductionDatabaseBackupProviderConfigured(): boolean {
  if (!configuredProvider) return false;
  try {
    assertProvider(configuredProvider, false);
    return true;
  } catch {
    return false;
  }
}

export function recordDatabaseRestoreDrill(report: DatabaseRestoreReport, verifiedAt: string): void {
  if (!configuredProvider || report.provider !== configuredProvider.id || report.verified !== true) {
    throw new Error("database restore drill does not match the configured provider");
  }
  if (!/^[a-f0-9]{64}$/.test(report.dataSha256) || report.schemaVersion !== STORE_SCHEMA_VERSION) {
    throw new Error("database restore drill receipt is invalid");
  }
  const parsed = new Date(verifiedAt);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== verifiedAt) {
    throw new Error("database restore drill timestamp is invalid");
  }
  verifiedRestoreDrill = { provider: report.provider, verifiedAt, dataSha256: report.dataSha256 };
}

export async function productionDatabaseBackupReady(now = new Date()): Promise<boolean> {
  if (!isProductionDatabaseBackupProviderConfigured() || !configuredProvider || !verifiedRestoreDrill) return false;
  const age = now.getTime() - Date.parse(verifiedRestoreDrill.verifiedAt);
  if (age < 0 || age > 30 * 24 * 60 * 60 * 1_000 || verifiedRestoreDrill.provider !== configuredProvider.id) {
    return false;
  }
  try {
    return await configuredProvider.checkHealth();
  } catch {
    return false;
  }
}

type BackupRow = Record<string, string | number | null>;
type BackupTable = "firm" | "firm_user" | "matter" | "rules_snapshot_archive" |
  "computation_audit" | "extraction_job" | "api_key";

export interface DatabaseBackupManifest {
  format_version: 1;
  schema_version: number;
  created_at: string;
  tables: Record<BackupTable, BackupRow[]>;
  counts: Record<BackupTable, number>;
  data_sha256: string;
}

export interface DatabaseBackupReceipt {
  provider: string;
  objectKey: string;
  manifestSha256: string;
  dataSha256: string;
  counts: DatabaseBackupManifest["counts"];
}

export interface DatabaseRestoreReport {
  provider: string;
  objectKey: string;
  schemaVersion: number;
  dataSha256: string;
  counts: DatabaseBackupManifest["counts"];
  verified: true;
}

const TABLES: readonly BackupTable[] = [
  "firm", "firm_user", "matter", "rules_snapshot_archive", "computation_audit", "extraction_job", "api_key",
];

export async function createDatabaseBackup(
  db: Db,
  provider: DatabaseBackupProvider,
  options: { createdAt?: string; allowTestProvider?: boolean } = {},
): Promise<DatabaseBackupReceipt> {
  assertProvider(provider, options.allowTestProvider ?? false);
  const createdAt = new Date(options.createdAt ?? Date.now()).toISOString();
  const tables = await db.transaction(async (tx) => {
    await tx.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const migration = await getMigrationState(tx);
    if (migration.currentVersion !== STORE_SCHEMA_VERSION || migration.pendingVersions.length > 0) {
      throw new Error("database schema is not current enough to back up");
    }
    return exportDatabaseTables(tx);
  });
  const dataSha256 = hashData(STORE_SCHEMA_VERSION, tables);
  const manifest: DatabaseBackupManifest = {
    format_version: 1,
    schema_version: STORE_SCHEMA_VERSION,
    created_at: createdAt,
    tables,
    counts: tableCounts(tables),
    data_sha256: dataSha256,
  };
  const bytes = Buffer.from(`${canonicalJson(manifest)}\n`, "utf8");
  const manifestSha256 = sha256(bytes);
  const objectKey = `stampdraft-database/v1/${manifestSha256}.json`;
  await provider.putObject(objectKey, bytes);
  return {
    provider: provider.id,
    objectKey,
    manifestSha256,
    dataSha256,
    counts: manifest.counts,
  };
}

export async function restoreDatabaseBackup(
  destination: Db,
  provider: DatabaseBackupProvider,
  objectKey: string,
  options: { allowTestProvider?: boolean } = {},
): Promise<DatabaseRestoreReport> {
  assertProvider(provider, options.allowTestProvider ?? false);
  const bytes = await provider.getObject(objectKey);
  if (!bytes) throw new Error("database backup object is unavailable");
  if (sha256(bytes) !== objectKey.split("/").at(-1)?.replace(/\.json$/, "")) {
    throw new Error("database backup manifest hash does not match its object key");
  }
  const manifest = parseManifest(bytes);
  await migrate(destination);

  await destination.transaction(async (tx) => {
    await assertCleanDestination(tx);
    await restoreTables(tx, manifest.tables);
    const restored = await exportDatabaseTables(tx);
    if (hashData(manifest.schema_version, restored) !== manifest.data_sha256) {
      throw new Error("restored database does not match the backup manifest");
    }
  });

  return {
    provider: provider.id,
    objectKey,
    schemaVersion: manifest.schema_version,
    dataSha256: manifest.data_sha256,
    counts: manifest.counts,
    verified: true,
  };
}

export class MemoryDatabaseBackupProvider implements DatabaseBackupProvider {
  readonly id = "memory-database-backup-test";
  readonly kind = "test" as const;
  readonly capabilities = { encryptedAtRest: false, offDevice: false };
  private readonly objects = new Map<string, Uint8Array>();

  async checkHealth(): Promise<boolean> {
    return true;
  }

  async putObject(objectKey: string, bytes: Uint8Array): Promise<void> {
    this.objects.set(objectKey, new Uint8Array(bytes));
  }

  async getObject(objectKey: string): Promise<Uint8Array | null> {
    const bytes = this.objects.get(objectKey);
    return bytes ? new Uint8Array(bytes) : null;
  }
}

async function exportDatabaseTables(db: DbSession): Promise<DatabaseBackupManifest["tables"]> {
  return {
    firm: (await db.query<BackupRow>(
      `SELECT id::text, name, ${utc("created_at")} AS created_at FROM firm ORDER BY id`,
    )).rows,
    firm_user: (await db.query<BackupRow>(
      `SELECT id::text, firm_id::text, identity_issuer, identity_subject, email, display_name,
              ${utc("created_at")} AS created_at
         FROM firm_user ORDER BY id`,
    )).rows,
    matter: (await db.query<BackupRow>(
      `SELECT id::text, firm_id::text, reference, title, client, created_by,
              ${utc("created_at")} AS created_at, ${utc("archived_at")} AS archived_at
         FROM matter ORDER BY id`,
    )).rows,
    rules_snapshot_archive: (await db.query<BackupRow>(
      `SELECT rules_version, jurisdiction, payload, ${utc("archived_at")} AS archived_at
         FROM rules_snapshot_archive ORDER BY rules_version`,
    )).rows,
    computation_audit: (await db.query<BackupRow>(
      `SELECT id::text, firm_id::text, matter_id::text, user_email, ${utc("computed_at")} AS computed_at,
              jurisdiction, rule_id, execution_date::text, input_values::text, input_facts::text,
              duty_paid, penalty_months, rules_version, engine_version, extraction_model_version,
              total_duty, output::text
         FROM computation_audit ORDER BY id`,
    )).rows,
    extraction_job: (await db.query<BackupRow>(
      `SELECT id::text, document_id::text, firm_id::text, user_email, provider_id, document_ref,
              filename, media_type, page_count, jurisdiction, rule_id, execution_date::text,
              retention_policy, ${utc("accepted_at")} AS accepted_at, ${utc("delete_by")} AS delete_by,
              status, model_version, redacted_fields::text, failure_code,
              ${utc("confirmed_at")} AS confirmed_at, ${utc("deleted_at")} AS deleted_at,
              deletion_reason, ${utc("created_at")} AS created_at, ${utc("updated_at")} AS updated_at
         FROM extraction_job ORDER BY id`,
    )).rows,
    api_key: (await db.query<BackupRow>(
      `SELECT id::text, firm_id::text, name, key_hash, ${utc("created_at")} AS created_at,
              ${utc("last_used_at")} AS last_used_at, ${utc("revoked_at")} AS revoked_at
         FROM api_key ORDER BY id`,
    )).rows,
  };
}

async function assertCleanDestination(db: DbSession): Promise<void> {
  await db.exec(`LOCK TABLE ${TABLES.join(", ")} IN ACCESS EXCLUSIVE MODE`);
  for (const table of TABLES) {
    const { rows } = await db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
    if (rows[0]?.count !== "0") throw new Error("database restore destination is not clean");
  }
}

async function restoreTables(db: DbSession, tables: DatabaseBackupManifest["tables"]): Promise<void> {
  for (const row of tables.firm) {
    await db.query("INSERT INTO firm (id,name,created_at) VALUES ($1,$2,$3)", values(row, ["id", "name", "created_at"]));
  }
  for (const row of tables.firm_user) {
    await db.query(
      `INSERT INTO firm_user (id,firm_id,identity_issuer,identity_subject,email,display_name,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      values(row, ["id", "firm_id", "identity_issuer", "identity_subject", "email", "display_name", "created_at"]),
    );
  }
  for (const row of tables.matter) {
    await db.query(
      `INSERT INTO matter (id,firm_id,reference,title,client,created_by,created_at,archived_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      values(row, ["id", "firm_id", "reference", "title", "client", "created_by", "created_at", "archived_at"]),
    );
  }
  for (const row of tables.rules_snapshot_archive) {
    await db.query(
      `INSERT INTO rules_snapshot_archive (rules_version,jurisdiction,payload,archived_at) VALUES ($1,$2,$3,$4)`,
      values(row, ["rules_version", "jurisdiction", "payload", "archived_at"]),
    );
  }
  for (const row of tables.computation_audit) {
    const rowValues = values(row, [
      "id", "firm_id", "matter_id", "user_email", "computed_at", "jurisdiction", "rule_id", "execution_date",
      "input_values", "input_facts", "duty_paid", "penalty_months", "rules_version", "engine_version",
      "extraction_model_version", "total_duty", "output",
    ]);
    await db.query(
      `INSERT INTO computation_audit (
         id,firm_id,matter_id,user_email,computed_at,jurisdiction,rule_id,execution_date,
         input_values,input_facts,duty_paid,penalty_months,rules_version,engine_version,
         extraction_model_version,total_duty,output)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17::json)`,
      rowValues,
    );
  }
  for (const row of tables.extraction_job) {
    const rowValues = values(row, [
      "id", "document_id", "firm_id", "user_email", "provider_id", "document_ref", "filename", "media_type",
      "page_count", "jurisdiction", "rule_id", "execution_date", "retention_policy", "accepted_at", "delete_by",
      "status", "model_version", "redacted_fields", "failure_code", "confirmed_at", "deleted_at", "deletion_reason",
      "created_at", "updated_at",
    ]);
    await db.query(
      `INSERT INTO extraction_job (
         id,document_id,firm_id,user_email,provider_id,document_ref,filename,media_type,page_count,
         jurisdiction,rule_id,execution_date,retention_policy,accepted_at,delete_by,status,model_version,
         redacted_fields,failure_code,confirmed_at,deleted_at,deletion_reason,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,$22,$23,$24)`,
      rowValues,
    );
  }
  for (const row of tables.api_key) {
    await db.query(
      `INSERT INTO api_key (id,firm_id,name,key_hash,created_at,last_used_at,revoked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      values(row, ["id", "firm_id", "name", "key_hash", "created_at", "last_used_at", "revoked_at"]),
    );
  }
}

function parseManifest(bytes: Uint8Array): DatabaseBackupManifest {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("database backup manifest is malformed");
  }
  if (!isRecord(value) || value.format_version !== 1 || value.schema_version !== STORE_SCHEMA_VERSION ||
      typeof value.created_at !== "string" || typeof value.data_sha256 !== "string" ||
      !isRecord(value.tables) || !isRecord(value.counts)) {
    throw new Error("database backup manifest has an unsupported shape");
  }
  const tables = value.tables as Record<string, unknown>;
  const counts = value.counts as Record<string, unknown>;
  if (Object.keys(tables).sort().join(",") !== [...TABLES].sort().join(",") ||
      Object.keys(counts).sort().join(",") !== [...TABLES].sort().join(",")) {
    throw new Error("database backup manifest table set is invalid");
  }
  for (const table of TABLES) {
    if (!Array.isArray(tables[table]) || tables[table].some((row) => !isRecord(row)) ||
        counts[table] !== tables[table].length) {
      throw new Error(`database backup manifest count is invalid for ${table}`);
    }
  }
  const manifest = value as unknown as DatabaseBackupManifest;
  if (!/^[a-f0-9]{64}$/.test(manifest.data_sha256) ||
      hashData(manifest.schema_version, manifest.tables) !== manifest.data_sha256) {
    throw new Error("database backup data hash is invalid");
  }
  return manifest;
}

function hashData(schemaVersion: number, tables: DatabaseBackupManifest["tables"]): string {
  return createHash("sha256").update(canonicalJson({ schema_version: schemaVersion, tables })).digest("hex");
}

function utc(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

function tableCounts(tables: DatabaseBackupManifest["tables"]): DatabaseBackupManifest["counts"] {
  return Object.fromEntries(TABLES.map((table) => [table, tables[table].length])) as DatabaseBackupManifest["counts"];
}

function values(row: BackupRow, keys: string[]): Array<string | number | null> {
  return keys.map((key) => {
    if (!(key in row)) throw new Error(`database backup row is missing ${key}`);
    return row[key]!;
  });
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertProvider(provider: DatabaseBackupProvider, allowTestProvider: boolean): void {
  if (provider.kind === "test") {
    if (allowTestProvider) return;
    throw new Error("test database backup providers are disabled outside tests");
  }
  if (!provider.capabilities.encryptedAtRest || !provider.capabilities.offDevice) {
    throw new Error("database backup provider does not satisfy the production durability contract");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
