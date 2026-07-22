import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ getStore: vi.fn(), expireDue: vi.fn() }));
vi.mock("@/lib/store-server", () => ({ getStore: mocks.getStore }));
vi.mock("@/lib/tier2-route", async () => {
  const { NextResponse } = await import("next/server");
  return {
    tier2Service: () => ({ expireDue: mocks.expireDue }),
    noStore: (body: Record<string, unknown>, status = 200) => {
      const response = NextResponse.json(body, { status });
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      return response;
    },
    tier2ErrorResponse: () => NextResponse.json({ ok: false, error: "redacted" }, { status: 500 }),
  };
});

import { POST } from "./route";

const SECRET = "retention-test-secret-with-at-least-32-bytes";

beforeEach(() => {
  vi.stubEnv("STAMPDRAFT_OPERATIONS_SECRET", SECRET);
  mocks.getStore.mockReset().mockResolvedValue({});
  mocks.expireDue.mockReset().mockResolvedValue({ deleted: 2, failed: 0 });
});

describe("retention operations hook", () => {
  it("refuses an unauthenticated scheduler", async () => {
    const response = await POST(new NextRequest("http://localhost/api/internal/retention", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(mocks.expireDue).not.toHaveBeenCalled();
  });

  it("runs a bounded expiry pass without caching its receipt", async () => {
    const response = await POST(new NextRequest("http://localhost/api/internal/retention?limit=9999", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true, deleted: 2, failed: 0 });
    expect(mocks.expireDue).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), 100);
  });
});
