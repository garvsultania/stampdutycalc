import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getStore: vi.fn(), authenticateRequest: vi.fn(), getFirmUserByIdentity: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store-server", () => {
  class MockWorkspaceUnavailableError extends Error {
    constructor(readonly detail: string) {
      super(detail);
      this.name = "WorkspaceUnavailableError";
    }
  }
  return {
    getStore: mocks.getStore,
    WorkspaceUnavailableError: MockWorkspaceUnavailableError,
    WORKSPACE_UNAVAILABLE_PUBLIC_DETAIL:
      "The workspace database is not configured or could not be reached. Ask the deployment administrator to check it.",
  };
});
vi.mock("@/lib/request-principal", () => ({ authenticateRequest: mocks.authenticateRequest }));

import { resolveWorkspace, workspaceUnavailableResponse } from "./api-workspace.js";

const FIRM_ID = "63b46723-a8a0-488d-8223-5b2aadad71b0";
const identity = { firmId: FIRM_ID, issuer: "https://identity.test", subject: "lawyer-1" };

beforeEach(() => {
  mocks.getStore.mockReset();
  mocks.authenticateRequest.mockReset();
  mocks.getFirmUserByIdentity.mockReset();
  mocks.getStore.mockResolvedValue({ getFirmUserByIdentity: mocks.getFirmUserByIdentity });
});

describe("workspace setup failures", () => {
  it("returns a useful 503 without exposing a database URL or driver message", async () => {
    const response = workspaceUnavailableResponse();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: "workspace unavailable" });
    expect(JSON.stringify(body)).not.toMatch(/private-db|operator|connection refused|postgres:/i);
  });

  it("fails closed before opening the store when no authentication adapter resolves a principal", async () => {
    mocks.authenticateRequest.mockResolvedValue(null);
    const result = await resolveWorkspace(request());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected authentication refusal");
    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toEqual({ ok: false, error: "authentication required" });
    expect(mocks.getStore).not.toHaveBeenCalled();
  });

  it("refuses an authenticated identity that is not a member of the asserted firm", async () => {
    mocks.authenticateRequest.mockResolvedValue(identity);
    mocks.getFirmUserByIdentity.mockResolvedValue(null);
    const result = await resolveWorkspace(request());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected firm refusal");
    expect(result.response.status).toBe(403);
    expect(mocks.getFirmUserByIdentity).toHaveBeenCalledWith(FIRM_ID, identity.issuer, identity.subject);
  });

  it("derives the route user from the stored firm membership", async () => {
    mocks.authenticateRequest.mockResolvedValue(identity);
    mocks.getFirmUserByIdentity.mockResolvedValue({
      id: "d5dbdb5a-4644-47b8-9dfc-12ff54fa18dc",
      firm_id: FIRM_ID,
      email: "lawyer@firm.in",
    });
    const result = await resolveWorkspace(request());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected authorized workspace");
    expect(result.workspace.principal).toMatchObject({
      ...identity,
      userEmail: "lawyer@firm.in",
    });
  });
});

function request(): NextRequest {
  return new NextRequest("http://localhost:3100/api/matters");
}
