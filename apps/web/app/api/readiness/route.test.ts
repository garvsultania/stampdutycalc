import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getStore: vi.fn(),
  authConfigured: vi.fn(),
  authReady: vi.fn(),
  extractionConfigured: vi.fn(),
  extractionReady: vi.fn(),
  operationsConfigured: vi.fn(),
  backupConfigured: vi.fn(),
  backupReady: vi.fn(),
  checkReadiness: vi.fn(),
}));
vi.mock("@/lib/store-server", () => ({ getStore: mocks.getStore }));
vi.mock("@/lib/request-principal", () => ({
  isRequestPrincipalAdapterConfigured: mocks.authConfigured,
  requestPrincipalAdapterReady: mocks.authReady,
}));
vi.mock("@/lib/tier2-provider", () => ({
  isProductionTier2ProviderConfigured: mocks.extractionConfigured,
  productionTier2ProviderReady: mocks.extractionReady,
}));
vi.mock("@/lib/operations-auth", () => ({ operationsAuthConfigured: mocks.operationsConfigured }));
vi.mock("@stampdraft/store", () => ({
  isProductionDatabaseBackupProviderConfigured: mocks.backupConfigured,
  productionDatabaseBackupReady: mocks.backupReady,
}));

import { GET } from "./route";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.authConfigured.mockReturnValue(false);
  mocks.authReady.mockResolvedValue(false);
  mocks.extractionConfigured.mockReturnValue(false);
  mocks.extractionReady.mockResolvedValue(false);
  mocks.operationsConfigured.mockReturnValue(false);
  mocks.backupConfigured.mockReturnValue(false);
  mocks.backupReady.mockResolvedValue(false);
  mocks.getStore.mockRejectedValue(new Error("postgres://admin:secret@private-db connection refused"));
});

describe("privacy-safe readiness endpoint", () => {
  it("reports stable dependency states without exposing connection or provider details", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      status: "not_ready",
      checks: {
        database: "unavailable",
        schema: "unavailable",
        append_only: "unavailable",
        archive_integrity: "unavailable",
        authentication: "unconfigured",
        extraction: "unconfigured",
        retention_operations: "unconfigured",
        backup: "unconfigured",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/postgres|private-db|secret|connection refused/i);
  });

  it("becomes ready only when schema, append-only guards, auth, and extraction are all ready", async () => {
    mocks.authConfigured.mockReturnValue(true);
    mocks.authReady.mockResolvedValue(true);
    mocks.extractionConfigured.mockReturnValue(true);
    mocks.extractionReady.mockResolvedValue(true);
    mocks.operationsConfigured.mockReturnValue(true);
    mocks.backupConfigured.mockReturnValue(true);
    mocks.backupReady.mockResolvedValue(true);
    mocks.getStore.mockResolvedValue({ checkReadiness: mocks.checkReadiness });
    mocks.checkReadiness.mockResolvedValue({
      ready: true,
      tablesReady: true,
      constraintsReady: true,
      appendOnlyReady: true,
      archiveIntegrityReady: true,
      schemaVersion: 1,
      latestSchemaVersion: 1,
    });
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, status: "ready" });
  });
});
