import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { issueMemoCapability } from "@/lib/memo-capability";
import type { ComputeOutput } from "@stampdraft/schema";

const SECRET = "pdf-api-test-memo-capability-secret-000000001";
const FIRM_ID = "63b46723-a8a0-488d-8223-5b2aadad71b0";
const OTHER_FIRM_ID = "a89db611-1353-423d-ab0c-087cb42fc638";
const RECORD_ID = "d5dbdb5a-4644-47b8-9dfc-12ff54fa18dc";
const mocks = vi.hoisted(() => ({ getComputation: vi.fn() }));

vi.mock("@/lib/api-workspace", () => ({
  resolveWorkspace: async () => ({
    ok: true,
    workspace: {
      store: { getComputation: mocks.getComputation },
      principal: { firmId: FIRM_ID, userEmail: "you@firm.in" },
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

describe("protected PDF memo export", () => {
  it("returns a no-store PDF only after a firm-scoped capability lookup", async () => {
    mocks.getComputation.mockResolvedValue(record());
    const response = await GET(request(token()));
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(bytes.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(mocks.getComputation).toHaveBeenCalledWith(FIRM_ID, RECORD_ID);
  });

  it("refuses missing, expired, tampered, and cross-firm capabilities before record lookup", async () => {
    const expired = issueMemoCapability({
      secret: SECRET,
      recordId: RECORD_ID,
      firmId: FIRM_ID,
      nowMs: Date.now() - 301_000,
    });
    const crossFirm = issueMemoCapability({
      secret: SECRET,
      recordId: RECORD_ID,
      firmId: OTHER_FIRM_ID,
    });
    const valid = token();
    const tampered = `${valid.slice(0, -1)}${valid.endsWith("A") ? "B" : "A"}`;

    for (const candidate of [null, expired, crossFirm, tampered]) {
      const response = await GET(request(candidate));
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ ok: false, error: "memo access refused" });
    }
    expect(mocks.getComputation).not.toHaveBeenCalled();
  });

  it("does not disclose an authorized ID that is absent inside the firm", async () => {
    mocks.getComputation.mockResolvedValue(null);
    const response = await GET(request(token()));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "memo record not found" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

function token(): string {
  return issueMemoCapability({ secret: SECRET, recordId: RECORD_ID, firmId: FIRM_ID });
}

function request(capability: string | null): NextRequest {
  const url = new URL("http://localhost:3100/api/computations/memo/pdf");
  if (capability) url.searchParams.set("token", capability);
  return new NextRequest(url);
}

function record() {
  return {
    id: RECORD_ID,
    computed_at: "2026-07-21T12:00:00.000Z",
    output: output(),
  };
}

function output(): ComputeOutput {
  return {
    rules_version: "rules-hash",
    jurisdiction: "DL",
    rule_id: "DL-RULE",
    instrument: "conveyance_sale_deed",
    act: "Indian Stamp Act, 1899",
    article: "23",
    execution_date: "2026-07-21",
    verified_as_of: null,
    breakup: [{ kind: "base_duty", label: "Base duty", amount: "100", citations: [] }],
    total_duty: "100",
    citations: [{ type: "act", ref: "Act s.1", quoted_text: "Duty is payable." }],
    warnings: [],
    penalty: null,
    inputs_echo: {
      jurisdiction: "DL",
      rule_id: "DL-RULE",
      execution_date: "2026-07-21",
      values: {},
      facts: {},
    },
  };
}
