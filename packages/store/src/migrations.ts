import { createHash } from "node:crypto";
import type { Db, DbSession } from "./db.js";
import { SCHEMA_SQL } from "./schema.js";

export interface StoreMigration {
  version: number;
  name: string;
  sql: string;
}

export interface MigrationState {
  currentVersion: number;
  latestVersion: number;
  pendingVersions: number[];
}

export const STORE_MIGRATIONS: readonly StoreMigration[] = [
  { version: 1, name: "workspace-audit-extraction-baseline", sql: SCHEMA_SQL },
];
export const STORE_SCHEMA_VERSION = STORE_MIGRATIONS.at(-1)!.version;

const LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS stampdraft_schema_migration (
  version integer PRIMARY KEY,
  name text NOT NULL,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

export async function runMigrations(
  db: Db,
  migrations: readonly StoreMigration[] = STORE_MIGRATIONS,
): Promise<MigrationState> {
  validateDefinitions(migrations);
  return db.transaction(async (tx) => {
    await tx.exec(LEDGER_SQL);
    // Concurrent application instances serialize before reading the ledger or
    // applying DDL. The lock is transaction-scoped and released on commit/rollback.
    await tx.exec("LOCK TABLE stampdraft_schema_migration IN ACCESS EXCLUSIVE MODE");
    const applied = await appliedMigrations(tx);
    const definitions = new Map(migrations.map((migration) => [migration.version, migration]));

    for (const row of applied) {
      const definition = definitions.get(row.version);
      if (!definition) {
        throw new Error(`database schema version ${row.version} is newer than this application`);
      }
      if (row.name !== definition.name || row.checksum !== migrationChecksum(definition)) {
        throw new Error(`applied migration ${row.version} does not match its immutable definition`);
      }
    }
    validateAppliedPrefix(applied);

    const appliedVersions = new Set(applied.map((row) => row.version));
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      await tx.exec(migration.sql);
      await tx.query(
        `INSERT INTO stampdraft_schema_migration (version, name, checksum)
         VALUES ($1, $2, $3)`,
        [migration.version, migration.name, migrationChecksum(migration)],
      );
    }

    const state = await getMigrationState(tx, migrations);
    if (state.pendingVersions.length > 0) throw new Error("database migrations did not reach the expected version");
    return state;
  });
}

export async function getMigrationState(
  db: DbSession,
  migrations: readonly StoreMigration[] = STORE_MIGRATIONS,
): Promise<MigrationState> {
  validateDefinitions(migrations);
  const applied = await appliedMigrations(db);
  const definitions = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const row of applied) {
    const definition = definitions.get(row.version);
    if (!definition) throw new Error(`database schema version ${row.version} is newer than this application`);
    if (row.name !== definition.name || row.checksum !== migrationChecksum(definition)) {
      throw new Error(`applied migration ${row.version} does not match its immutable definition`);
    }
  }
  validateAppliedPrefix(applied);
  const appliedVersions = new Set(applied.map((row) => row.version));
  const latestVersion = migrations.at(-1)?.version ?? 0;
  return {
    currentVersion: applied.reduce((max, row) => Math.max(max, row.version), 0),
    latestVersion,
    pendingVersions: migrations.map((migration) => migration.version).filter((version) => !appliedVersions.has(version)),
  };
}

export function migrationChecksum(migration: StoreMigration): string {
  return createHash("sha256")
    .update(`${migration.version}\n${migration.name}\n${migration.sql}`)
    .digest("hex");
}

async function appliedMigrations(db: DbSession): Promise<Array<{
  version: number;
  name: string;
  checksum: string;
}>> {
  const { rows } = await db.query<{ version: number; name: string; checksum: string }>(
    "SELECT version, name, checksum FROM stampdraft_schema_migration ORDER BY version ASC",
  );
  return rows;
}

function validateDefinitions(migrations: readonly StoreMigration[]): void {
  let previous = 0;
  const names = new Set<string>();
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version !== previous + 1) {
      throw new Error("store migrations must use contiguous forward-only versions starting at 1");
    }
    if (!migration.name.trim() || names.has(migration.name) || !migration.sql.trim()) {
      throw new Error(`store migration ${migration.version} has an invalid immutable definition`);
    }
    previous = migration.version;
    names.add(migration.name);
  }
}

function validateAppliedPrefix(applied: readonly { version: number }[]): void {
  for (let index = 0; index < applied.length; index += 1) {
    if (applied[index]!.version !== index + 1) {
      throw new Error("applied store migrations must form a contiguous forward-only prefix");
    }
  }
}
