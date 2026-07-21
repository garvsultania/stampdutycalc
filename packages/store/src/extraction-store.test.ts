import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { connect, migrate, Store, type Db } from "./index.js";

let db: Db;
let store: Store;
let firmId: string;

beforeAll(async () => {
  db = await connect(undefined);
  await migrate(db);
  store = new Store(db);
  const firm = await store.createFirm("Extraction Test Firm");
  firmId = firm.id;
  await store.addUser(firmId, "extractor@test.in", "Extractor", {
    issuer: "https://identity.test",
    subject: "extractor-1",
  });
});

afterAll(async () => db.close());

describe("persisted Tier 2 extraction state", () => {
  it("stores only redacted fields and enforces lifecycle transitions", async () => {
    const job = await createJob("compute_and_delete", null);
    expect(job.status).toBe("queued");
    expect(await store.getExtractionJob(randomUUID(), job.id)).toBeNull();

    await store.markExtractionProcessing(firmId, job.id);
    const completed = await store.completeExtractionJob(firmId, job.id, "fake-model-v1", [{
      key: "consideration",
      kind: "value",
      status: "found",
      source_page: 2,
    }]);
    expect(completed).toMatchObject({ status: "completed", model_version: "fake-model-v1" });
    expect(JSON.stringify(completed)).not.toMatch(/proposed_value|snippet|Rupees|1000000/);
    await expect(store.markExtractionProcessing(firmId, job.id)).rejects.toThrow(/state transition/);

    const deleted = await store.deleteExtractionJob(
      firmId,
      job.id,
      "2026-07-22T10:05:00.000Z",
      "confirmation_completed",
    );
    expect(deleted).toMatchObject({
      status: "deleted",
      document_ref: null,
      filename: "[deleted]",
      redacted_fields: [],
      deletion_reason: "confirmation_completed",
      confirmed_at: "2026-07-22T10:05:00.000Z",
    });
  });

  it("selects expired thirty-day jobs and records user deletion idempotently", async () => {
    const due = await createJob("thirty_days", "2026-08-21T10:00:00.000Z");
    const later = await createJob("thirty_days", "2026-09-21T10:00:00.000Z");
    const abandoned = await createJob("compute_and_delete", null);
    expect((await store.listExpiredExtractionJobs("2026-07-23T09:59:59.000Z")).map((job) => job.id)).not.toContain(abandoned.id);
    expect((await store.listExpiredExtractionJobs("2026-07-23T10:00:00.000Z")).map((job) => job.id)).toContain(abandoned.id);
    expect((await store.listExpiredExtractionJobs("2026-08-21T10:00:00.000Z")).map((job) => job.id)).toContain(due.id);
    expect((await store.listExpiredExtractionJobs("2026-08-21T10:00:00.000Z")).map((job) => job.id)).not.toContain(later.id);

    const first = await store.deleteExtractionJob(firmId, due.id, "2026-08-21T10:00:00.000Z", "user_deleted");
    const second = await store.deleteExtractionJob(firmId, due.id, "2026-08-22T10:00:00.000Z", "retention_expired");
    expect(second).toEqual(first);
  });
});

async function createJob(
  retentionPolicy: "compute_and_delete" | "thirty_days",
  deleteBy: string | null,
) {
  return store.createExtractionJob({
    id: randomUUID(),
    documentId: randomUUID(),
    firmId,
    userEmail: "extractor@test.in",
    providerId: "local-fake",
    documentRef: `fake://${randomUUID()}`,
    filename: "draft.pdf",
    mediaType: "application/pdf",
    pageCount: 3,
    jurisdiction: "DL",
    ruleId: "DL-ART23-conveyance",
    executionDate: "2026-07-22",
    retentionPolicy,
    acceptedAt: "2026-07-22T10:00:00.000Z",
    deleteBy,
  });
}
