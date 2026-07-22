import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { verifyMemoCapability } from "@/lib/memo-capability";

const SECRET = "api-test-memo-capability-secret-00000000001";
const FIRM_ID = "63b46723-a8a0-488d-8223-5b2aadad71b0";
const RECORD_ID = "d5dbdb5a-4644-47b8-9dfc-12ff54fa18dc";
const mocks = vi.hoisted(() => ({
  getComputation: vi.fn(),
}));

vi.mock("@/lib/api-workspace", () => ({
  resolveWorkspace: async () => ({
    ok: true,
    workspace: {
      store: { getComputation: mocks.getComputation },
      principal: {
        firmId: FIRM_ID,
        userEmail: "you@firm.in",
      },
    },
  }),
}));

import { GET } from "./route";

const originalSecret = process.env.STAMPDRAFT_MEMO_CAPABILITY_SECRET;

beforeEach(() => {
  process.env.STAMPDRAFT_MEMO_CAPABILITY_SECRET = SECRET;
  mocks.getComputation.mockReset();
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.STAMPDRAFT_MEMO_CAPABILITY_SECRET;
  else process.env.STAMPDRAFT_MEMO_CAPABILITY_SECRET = originalSecret;
});

describe("memo capability issuance API", () => {
  it("authorizes the firm-scoped record and redirects with a short-lived capability", async () => {
    mocks.getComputation.mockResolvedValue({ id: RECORD_ID });
    const response = await GET(requestFor(RECORD_ID));

    expect(response.status).toBe(303);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.getComputation).toHaveBeenCalledWith(FIRM_ID, RECORD_ID);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/memo");
    expect(location.searchParams.has("recordId")).toBe(false);
    const token = location.searchParams.get("token");
    expect(token).toEqual(expect.any(String));
    expect(verifyMemoCapability(token!, { secret: SECRET, expectedFirmId: FIRM_ID }).recordId).toBe(RECORD_ID);
  });

  it("returns the same not-found response for unknown and malformed record IDs", async () => {
    mocks.getComputation.mockResolvedValue(null);
    const unknown = await GET(requestFor(RECORD_ID));
    const malformed = await GET(requestFor("not-a-uuid"));

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    await expect(unknown.json()).resolves.toEqual({ ok: false, error: "record not found" });
    await expect(malformed.json()).resolves.toEqual({ ok: false, error: "record not found" });
    expect(mocks.getComputation).toHaveBeenCalledTimes(1);
  });
});

function requestFor(recordId: string): NextRequest {
  return new NextRequest(`http://localhost:3100/api/computations/memo?recordId=${encodeURIComponent(recordId)}`);
}
