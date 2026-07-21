import { afterEach, describe, expect, it } from "vitest";
import {
  connect,
  getMigrationState,
  migrate,
  migrationChecksum,
  runMigrations,
  STORE_MIGRATIONS,
  Store,
  type Db,
  type StoreMigration,
} from "./index.js";

const opened: Db[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.close()));
});

describe("forward-only store migrations", () => {
  it("records the immutable baseline once and leaves a current database unchanged", async () => {
    const db = await fresh();
    await migrate(db);
    const first = await db.query<{ version: number; checksum: string; applied_at: string }>(
      "SELECT version, checksum, applied_at FROM stampdraft_schema_migration",
    );
    await migrate(db);
    const second = await db.query<{ version: number; checksum: string; applied_at: string }>(
      "SELECT version, checksum, applied_at FROM stampdraft_schema_migration",
    );

    expect(second.rows).toEqual(first.rows);
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0]).toMatchObject({
      version: STORE_MIGRATIONS[0]!.version,
      checksum: migrationChecksum(STORE_MIGRATIONS[0]!),
    });
    await expect(getMigrationState(db)).resolves.toMatchObject({ pendingVersions: [] });
  });

  it("refuses checksum drift and a database newer than the application", async () => {
    const drifted = await fresh();
    await migrate(drifted);
    await drifted.query("UPDATE stampdraft_schema_migration SET checksum = $1 WHERE version = 1", ["0".repeat(64)]);
    await expect(migrate(drifted)).rejects.toThrow(/immutable definition/);

    const newer = await fresh();
    await newer.exec(`CREATE TABLE stampdraft_schema_migration (
      version integer PRIMARY KEY, name text NOT NULL, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now())`);
    await newer.query(
      "INSERT INTO stampdraft_schema_migration (version, name, checksum) VALUES ($1,$2,$3)",
      [2, "future", "f".repeat(64)],
    );
    await expect(migrate(newer)).rejects.toThrow(/newer than this application/);
  });

  it("rolls back a failed forward migration without recording it", async () => {
    const db = await fresh();
    const v1: StoreMigration = { version: 1, name: "fixture-one", sql: "CREATE TABLE fixture_one (id integer PRIMARY KEY)" };
    const v2: StoreMigration = {
      version: 2,
      name: "fixture-two",
      sql: "CREATE TABLE fixture_two (id integer PRIMARY KEY); INSERT INTO missing_table VALUES (1)",
    };
    await runMigrations(db, [v1]);
    await expect(runMigrations(db, [v1, v2])).rejects.toThrow();

    const ledger = await db.query<{ version: number }>("SELECT version FROM stampdraft_schema_migration ORDER BY version");
    expect(ledger.rows.map((row) => row.version)).toEqual([1]);
    const table = await db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM information_schema.tables WHERE table_name = 'fixture_two'",
    );
    expect(table.rows[0]!.count).toBe("0");
  });

  it("refuses a migration ledger with a gap in its applied history", async () => {
    const db = await fresh();
    const v1: StoreMigration = { version: 1, name: "fixture-one", sql: "CREATE TABLE fixture_one (id integer)" };
    const v2: StoreMigration = { version: 2, name: "fixture-two", sql: "CREATE TABLE fixture_two (id integer)" };
    await runMigrations(db, [v1, v2]);
    await db.query("DELETE FROM stampdraft_schema_migration WHERE version = 1");

    await expect(runMigrations(db, [v1, v2])).rejects.toThrow(/contiguous forward-only prefix/);
  });

  it("reports required schema and append-only protections as readiness boundaries", async () => {
    const db = await fresh();
    await migrate(db);
    const store = new Store(db);
    await expect(store.checkReadiness()).resolves.toMatchObject({
      ready: true,
      schemaVersion: 1,
      latestSchemaVersion: 1,
      tablesReady: true,
      constraintsReady: true,
      appendOnlyReady: true,
      archiveIntegrityReady: true,
    });

    await db.exec("DROP TRIGGER computation_audit_no_update ON computation_audit");
    await expect(store.checkReadiness()).resolves.toMatchObject({
      ready: false,
      schemaVersion: 1,
      latestSchemaVersion: 1,
      tablesReady: true,
      constraintsReady: true,
      appendOnlyReady: false,
      archiveIntegrityReady: true,
    });

    await db.exec("ALTER TABLE computation_audit DROP CONSTRAINT audit_rules_snapshot_fk");
    await expect(store.checkReadiness()).resolves.toMatchObject({
      ready: false,
      constraintsReady: false,
    });
  });
});

async function fresh(): Promise<Db> {
  const db = await connect(undefined);
  opened.push(db);
  return db;
}
