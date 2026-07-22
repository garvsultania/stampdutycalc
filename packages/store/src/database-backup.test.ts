import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildSnapshot, compute, createSnapshotArchive, loadStateDir } from "@stampdraft/engine";
import {
  connect,
  createDatabaseBackup,
  installDatabaseBackupProvider,
  MemoryDatabaseBackupProvider,
  migrate,
  productionDatabaseBackupReady,
  recordDatabaseRestoreDrill,
  restoreDatabaseBackup,
  Store,
  type Db,
} from "./index.js";

const opened: Db[] = [];
const dl = loadStateDir(fileURLToPath(new URL("../../../rules/DL", import.meta.url)));
const input = {
  jurisdiction: "DL" as const,
  rule_id: "DL-ART23-conveyance",
  execution_date: "2024-06-01",
  values: { consideration: "10000000", market_value: "10000000" },
  facts: { transferee_category: "female" },
};

afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.close()));
});

describe("provider-neutral database backup and clean restore", () => {
  it("restores tenant, snapshot, audit, extraction, and API-key state without weakening append-only tables", async () => {
    const source = await fresh();
    await migrate(source);
    const sourceStore = new Store(source);
    const firm = await sourceStore.createFirm("Backup Test Firm");
    await sourceStore.addUser(firm.id, "lawyer@test.in", "Backup Lawyer", {
      issuer: "https://identity.test",
      subject: "backup-lawyer-1",
    });
    const matter = await sourceStore.createMatter({
      firmId: firm.id,
      reference: "BACKUP-001",
      title: "Backup verification",
      client: "Test Client",
      createdBy: "lawyer@test.in",
    });
    const output = compute(dl.ruleSet, input);
    const snapshot = createSnapshotArchive(buildSnapshot(dl.ruleSet, input.jurisdiction, input.execution_date));
    const audit = await sourceStore.recordComputation({
      firmId: firm.id,
      matterId: matter.id,
      userEmail: "lawyer@test.in",
      output,
      snapshotArchive: snapshot,
      engineVersion: "backup-test-1",
    });
    const extraction = await sourceStore.createExtractionJob({
      id: randomUUID(),
      documentId: randomUUID(),
      firmId: firm.id,
      userEmail: "lawyer@test.in",
      providerId: "local-test-extractor",
      documentRef: "memory://backup-document",
      filename: "draft.pdf",
      mediaType: "application/pdf",
      pageCount: 2,
      jurisdiction: "DL",
      ruleId: input.rule_id,
      executionDate: input.execution_date,
      retentionPolicy: "compute_and_delete",
      acceptedAt: "2026-07-22T10:00:00.000Z",
      deleteBy: null,
    });
    await sourceStore.markExtractionProcessing(firm.id, extraction.id);
    await sourceStore.completeExtractionJob(firm.id, extraction.id, "test-model-1", [{
      key: "consideration",
      kind: "value",
      status: "found",
      source_page: 1,
    }]);
    const { key } = await sourceStore.createApiKey(firm.id, "Restored key");

    const provider = new MemoryDatabaseBackupProvider();
    const receipt = await createDatabaseBackup(source, provider, {
      createdAt: "2026-07-22T11:00:00.000Z",
      allowTestProvider: true,
    });
    const destination = await fresh();
    const report = await restoreDatabaseBackup(destination, provider, receipt.objectKey, {
      allowTestProvider: true,
    });

    expect(report).toMatchObject({ verified: true, dataSha256: receipt.dataSha256 });
    expect(report.counts).toMatchObject({
      firm: 1,
      firm_user: 1,
      matter: 1,
      rules_snapshot_archive: 1,
      computation_audit: 1,
      extraction_job: 1,
      api_key: 1,
    });

    const restored = new Store(destination);
    await expect(restored.getFirmUserByIdentity(
      firm.id,
      "https://identity.test",
      "backup-lawyer-1",
    )).resolves.toMatchObject({ email: "lawyer@test.in" });
    await expect(restored.getMatter(firm.id, matter.id)).resolves.toMatchObject({ reference: "BACKUP-001" });
    await expect(restored.getComputation(firm.id, audit.id)).resolves.toMatchObject({
      rules_version: output.rules_version,
      total_duty: output.total_duty,
    });
    await expect(restored.getSnapshotArchive(output.rules_version)).resolves.toMatchObject({
      payload: { jurisdiction: "DL" },
    });
    await expect(restored.getExtractionJob(firm.id, extraction.id)).resolves.toMatchObject({
      status: "completed",
      model_version: "test-model-1",
    });
    await expect(restored.resolveApiKey(key)).resolves.toMatchObject({ firm_id: firm.id });

    await expect(destination.query(
      "UPDATE computation_audit SET engine_version = 'tampered' WHERE id = $1",
      [audit.id],
    )).rejects.toThrow(/append-only/i);
    await expect(destination.query(
      "DELETE FROM rules_snapshot_archive WHERE rules_version = $1",
      [output.rules_version],
    )).rejects.toThrow(/append-only/i);
    await expect(restoreDatabaseBackup(destination, provider, receipt.objectKey, {
      allowTestProvider: true,
    })).rejects.toThrow(/not clean/);
  }, 20_000);

  it("rejects test providers by default and detects a corrupted stored object", async () => {
    const source = await fresh();
    await migrate(source);
    const provider = new MemoryDatabaseBackupProvider();
    await expect(createDatabaseBackup(source, provider)).rejects.toThrow(/test database backup providers are disabled/);

    const receipt = await createDatabaseBackup(source, provider, { allowTestProvider: true });
    const bytes = await provider.getObject(receipt.objectKey);
    if (!bytes) throw new Error("test backup was not stored");
    bytes[0] = bytes[0]! ^ 1;
    await provider.putObject(receipt.objectKey, bytes);

    const destination = await fresh();
    await expect(restoreDatabaseBackup(destination, provider, receipt.objectKey, {
      allowTestProvider: true,
    })).rejects.toThrow(/manifest hash/);
  }, 15_000);

  it("keeps readiness red until a healthy external provider has a recent verified restore drill", async () => {
    const memory = new MemoryDatabaseBackupProvider();
    const provider = {
      id: "external-backup-test",
      kind: "external" as const,
      capabilities: { encryptedAtRest: true, offDevice: true },
      checkHealth: async () => true,
      putObject: memory.putObject.bind(memory),
      getObject: memory.getObject.bind(memory),
    };
    const restore = installDatabaseBackupProvider(provider);
    try {
      await expect(productionDatabaseBackupReady(new Date("2026-07-22T12:00:00.000Z"))).resolves.toBe(false);
      recordDatabaseRestoreDrill({
        provider: provider.id,
        objectKey: "stampdraft-database/v1/test.json",
        schemaVersion: 1,
        dataSha256: "a".repeat(64),
        counts: {
          firm: 0, firm_user: 0, matter: 0, rules_snapshot_archive: 0,
          computation_audit: 0, extraction_job: 0, api_key: 0,
        },
        verified: true,
      }, "2026-07-22T11:00:00.000Z");
      await expect(productionDatabaseBackupReady(new Date("2026-07-22T12:00:00.000Z"))).resolves.toBe(true);
      await expect(productionDatabaseBackupReady(new Date("2026-08-22T12:00:00.000Z"))).resolves.toBe(false);
    } finally {
      restore();
    }
  });
});

async function fresh(): Promise<Db> {
  const db = await connect(undefined);
  opened.push(db);
  return db;
}
