import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { connect, migrate, Store, type Db } from "@stampdraft/store";
import { RuleInputContractSchema, type ExtractionDraft } from "@stampdraft/schema";
import { evaluateTier2Provider } from "./tier2-evaluation.js";
import { Tier2LifecycleError, Tier2LifecycleService } from "./tier2-lifecycle.js";
import { LocalFakeTier2Provider } from "./tier2-provider.js";

const contract = RuleInputContractSchema.parse({
  jurisdiction: "DL",
  rule_id: "DL-TEST-TIER2",
  effective_from: "2020-01-01",
  effective_to: null,
  fields: [
    { key: "consideration", label: "Consideration", kind: "value", type: "money" },
    { key: "term_months", label: "Term", kind: "value", type: "positive_integer" },
    {
      key: "parties",
      label: "Parties",
      kind: "fact",
      type: "select",
      options: [{ value: "alice-bob", label: "Alice and Bob" }],
    },
  ],
});

let db: Db;
let store: Store;
let firmId: string;

beforeAll(async () => {
  db = await connect(undefined);
  await migrate(db);
  store = new Store(db);
  const firm = await store.createFirm("Tier 2 Test Firm");
  firmId = firm.id;
  await store.addUser(firmId, "tier2@test.in", "Tier 2 User", {
    issuer: "https://identity.test",
    subject: "tier2-user",
  });
});

afterAll(async () => db.close());

describe("provider-independent Tier 2 lifecycle", () => {
  it("persists redacted status, allows authorized draft read, and compute-deletes after confirmation", async () => {
    const provider = providerFor(validDraft);
    const service = new Tier2LifecycleService(store, provider, { allowTestProvider: true });
    const created = await service.create(createArgs(0));

    expect(created).toMatchObject({ status: "completed", document_state: "active", snippets_state: "active" });
    expect(JSON.stringify(created)).not.toMatch(/1000000|Alice and Bob|SECRET|"snippet"|proposed_value/);
    const persisted = await store.getExtractionJob(firmId, created.id);
    expect(persisted?.document_ref).toEqual(expect.any(String));
    expect(provider.hasDocument(persisted!.document_ref!)).toBe(true);

    const fullDraft = await service.readDraft(firmId, created.id, contract);
    expect(JSON.stringify(fullDraft)).toContain("SECRET consideration source");
    await expect(service.status("63b46723-a8a0-488d-8223-5b2aadad71b0", created.id)).rejects.toMatchObject({
      code: "not_found",
    });

    const result = await service.confirm({
      firmId,
      id: created.id,
      contract,
      occurredAt: "2026-07-22T10:05:00.000Z",
      confirmation: {
        draft_id: created.id,
        fields: [
          { key: "consideration", kind: "value", confirmed_value: "1000000", disposition: "accepted" },
          { key: "term_months", kind: "value", confirmed_value: "12", disposition: "accepted" },
          { key: "parties", kind: "fact", confirmed_value: "alice-bob", disposition: "accepted" },
        ],
      },
    });

    expect(result.confirmed).toEqual({
      values: { consideration: "1000000", term_months: "12" },
      facts: { parties: "alice-bob" },
      extraction_model_version: "fake-model-v1",
    });
    expect(result.job).toMatchObject({
      status: "deleted",
      fields: [],
      document_state: "deleted",
      snippets_state: "deleted",
      deletion_reason: "confirmation_completed",
    });
    expect(provider.hasDocument(persisted!.document_ref!)).toBe(false);
  });

  it("retains thirty-day drafts after confirmation and expires them at the parsed deadline", async () => {
    const provider = providerFor(validDraft);
    const service = new Tier2LifecycleService(store, provider, { allowTestProvider: true });
    const created = await service.create(createArgs(30));
    await service.confirm({
      firmId,
      id: created.id,
      contract,
      occurredAt: "2026-07-22T10:05:00.000Z",
      confirmation: acceptedConfirmation(created.id),
    });
    expect((await service.status(firmId, created.id)).status).toBe("confirmed");

    expect(await service.expireDue("2026-08-21T09:59:59.000Z")).toEqual({ deleted: 0, failed: 0 });
    expect(await service.expireDue("2026-08-21T10:00:00.000Z")).toEqual({ deleted: 1, failed: 0 });
    expect(await service.status(firmId, created.id)).toMatchObject({ status: "deleted", fields: [] });
  });

  it("does not confirm or delete a draft when its deterministic consumer fails", async () => {
    const provider = providerFor(validDraft);
    const service = new Tier2LifecycleService(store, provider, { allowTestProvider: true });
    const created = await service.create(createArgs(0));
    const persisted = await store.getExtractionJob(firmId, created.id);

    await expect(service.confirm({
      firmId,
      id: created.id,
      contract,
      occurredAt: "2026-07-22T10:05:00.000Z",
      confirmation: acceptedConfirmation(created.id),
      consume: async () => {
        throw new Error("audit unavailable");
      },
    })).rejects.toThrow("audit unavailable");

    expect(await service.status(firmId, created.id)).toMatchObject({ status: "completed" });
    expect(provider.hasDocument(persisted!.document_ref!)).toBe(true);
    await service.delete(firmId, created.id, "2026-07-22T10:06:00.000Z");
  });

  it("recovers a confirmed compute-and-delete job after a transient provider deletion failure", async () => {
    const provider = providerFor(validDraft);
    const originalDelete = provider.deleteDocumentAndDraft.bind(provider);
    vi.spyOn(provider, "deleteDocumentAndDraft")
      .mockRejectedValueOnce(new Error("temporary provider outage"))
      .mockImplementation(originalDelete);
    const service = new Tier2LifecycleService(store, provider, { allowTestProvider: true });
    const created = await service.create(createArgs(0));

    await expect(service.confirm({
      firmId,
      id: created.id,
      contract,
      occurredAt: "2026-07-22T10:05:00.000Z",
      confirmation: acceptedConfirmation(created.id),
    })).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(await service.status(firmId, created.id)).toMatchObject({ status: "confirmed" });

    await expect(service.expireDue("2026-07-22T10:06:00.000Z")).resolves.toEqual({ deleted: 1, failed: 0 });
    expect(await service.status(firmId, created.id)).toMatchObject({
      status: "deleted",
      deletion_reason: "confirmation_completed",
    });
  });

  it("expires an abandoned compute-and-delete job after the 24-hour safety ceiling", async () => {
    const provider = providerFor(validDraft);
    const service = new Tier2LifecycleService(store, provider, { allowTestProvider: true });
    const created = await service.create(createArgs(0));

    await expect(service.expireDue("2026-07-23T09:59:59.000Z")).resolves.toEqual({ deleted: 0, failed: 0 });
    await expect(service.expireDue("2026-07-23T10:00:00.000Z")).resolves.toEqual({ deleted: 1, failed: 0 });
    expect(await service.status(firmId, created.id)).toMatchObject({
      status: "deleted",
      deletion_reason: "retention_expired",
    });
  });

  it("records only a safe failure code when provider extraction fails", async () => {
    const provider = providerFor(() => { throw new Error("provider secret token abc123"); });
    const service = new Tier2LifecycleService(store, provider, { allowTestProvider: true });
    const failed = await service.create(createArgs(0));
    expect(failed).toMatchObject({ status: "failed", failure_code: "provider_failed", fields: [] });
    expect(JSON.stringify(failed)).not.toMatch(/secret|abc123|token/i);
  });

  it("rejects the local fake unless explicitly enabled for tests", () => {
    expect(() => new Tier2LifecycleService(store, providerFor(validDraft))).toThrowError(Tier2LifecycleError);
  });

  it("runs a deterministic high-risk precision harness without reporting client text", async () => {
    const provider = providerFor(validDraft);
    const report = await evaluateTier2Provider(provider, [{
      caseId: "case-001",
      intake: intake(0),
      bytes: documentBytes(),
      contract,
      expected: [
        { metric: "consideration", fieldKey: "consideration", value: "1000000" },
        { metric: "term", fieldKey: "term_months", value: "12" },
        { metric: "parties", fieldKey: "parties", value: "alice-bob" },
      ],
    }]);
    expect(report.gate_passed).toBe(true);
    expect(report.metrics.consideration.precision).toBe(1);
    expect(JSON.stringify(report)).not.toMatch(/SECRET|Alice|Bob|1000000|snippet/);

    const inaccurate = providerFor((input) => {
      const result = validDraft(input);
      const consideration = result.fields.find((field) => field.key === "consideration");
      if (consideration?.status === "found") consideration.proposed_value = "999";
      return result;
    });
    const failedReport = await evaluateTier2Provider(inaccurate, [{
      caseId: "case-001",
      intake: intake(0),
      bytes: documentBytes(),
      contract,
      expected: [
        { metric: "consideration", fieldKey: "consideration", value: "1000000" },
        { metric: "term", fieldKey: "term_months", value: "12" },
        { metric: "parties", fieldKey: "parties", value: "alice-bob" },
      ],
    }]);
    expect(failedReport.gate_passed).toBe(false);
    expect(failedReport.metrics.consideration.precision).toBe(0);
  });
});

function providerFor(factory: ConstructorParameters<typeof LocalFakeTier2Provider>[0]) {
  return new LocalFakeTier2Provider(factory);
}

function createArgs(retentionDays: 0 | 30) {
  return {
    firmId,
    userEmail: "tier2@test.in",
    intake: intake(retentionDays),
    bytes: documentBytes(),
    contract,
    executionDate: "2026-07-22",
    acceptedAt: "2026-07-22T10:00:00.000Z",
  };
}

function intake(retentionDays: 0 | 30) {
  return {
    filename: "draft.pdf",
    media_type: "application/pdf",
    page_count: 3,
    retention_days: retentionDays,
    consent_to_process: true,
  } as const;
}

function documentBytes(): Uint8Array {
  return new TextEncoder().encode("%PDF-1.7\nfixture");
}

function validDraft(input: Parameters<ConstructorParameters<typeof LocalFakeTier2Provider>[0]>[0]): ExtractionDraft {
  return {
    schema_version: "1",
    draft_id: input.draftId,
    document_id: input.documentId,
    model_version: "fake-model-v1",
    page_count: input.pageCount,
    fields: [
      {
        key: "consideration", kind: "value", status: "found", proposed_value: "1000000",
        source: { page: 2, snippet: "SECRET consideration source" },
      },
      {
        key: "term_months", kind: "value", status: "found", proposed_value: "12",
        source: { page: 2, snippet: "term is twelve months" },
      },
      {
        key: "parties", kind: "fact", status: "found", proposed_value: "alice-bob",
        source: { page: 1, snippet: "Alice and Bob are the parties" },
      },
    ],
  };
}

function acceptedConfirmation(draftId: string) {
  return {
    draft_id: draftId,
    fields: [
      { key: "consideration", kind: "value" as const, confirmed_value: "1000000", disposition: "accepted" as const },
      { key: "term_months", kind: "value" as const, confirmed_value: "12", disposition: "accepted" as const },
      { key: "parties", kind: "fact" as const, confirmed_value: "alice-bob", disposition: "accepted" as const },
    ],
  };
}
