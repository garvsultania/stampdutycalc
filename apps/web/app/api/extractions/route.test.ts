import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ resolveWorkspace: vi.fn() }));
vi.mock("@/lib/api-workspace", () => ({ resolveWorkspace: mocks.resolveWorkspace }));

import { POST } from "./route";

beforeEach(() => {
  mocks.resolveWorkspace.mockReset();
  mocks.resolveWorkspace.mockResolvedValue({
    ok: true,
    workspace: {
      firmId: "63b46723-a8a0-488d-8223-5b2aadad71b0",
      principal: { userEmail: "tier2@test.in" },
      store: {},
    },
  });
});

describe("Tier 2 intake route", () => {
  it("fails closed before accepting bytes when no external provider is configured", async () => {
    const request = new NextRequest("http://localhost:3100/api/extractions", {
      method: "POST",
      body: "client document must not be parsed",
    });
    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "document extraction is unavailable",
      code: "provider_unavailable",
    });
  });
});
