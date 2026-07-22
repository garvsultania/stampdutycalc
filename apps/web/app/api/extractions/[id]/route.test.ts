import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const FIRM_ID = "63b46723-a8a0-488d-8223-5b2aadad71b0";
const JOB_ID = "d5dbdb5a-4644-47b8-9dfc-12ff54fa18dc";
const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  status: vi.fn(),
  readDraft: vi.fn(),
  delete: vi.fn(),
  confirm: vi.fn(),
  contractForJob: vi.fn(),
  getExtractionJob: vi.fn(),
  recordComputation: vi.fn(),
  compute: vi.fn(),
}));

vi.mock("@/lib/api-workspace", () => ({ resolveWorkspace: mocks.resolveWorkspace }));
vi.mock("@/lib/rules-server", () => ({ getCorpus: () => ({ corpus: { ruleSet: {} } }) }));
vi.mock("@/lib/execution-policy", () => ({ executionPolicyForRequest: () => ({}) }));
vi.mock("@/lib/store-server", () => ({ ENGINE_VERSION: "test-engine" }));
vi.mock("@/lib/computation-refusal", () => ({
  describeEngineRefusal: () => ({ code: "ENGINE_REFUSAL" }),
  isEngineError: () => false,
}));
vi.mock("@stampdraft/engine", () => ({
  compute: mocks.compute,
  buildSnapshot: () => ({ jurisdiction: "DL" }),
  createSnapshotArchive: () => ({ jurisdiction: "DL" }),
}));
vi.mock("@/lib/tier2-route", async () => {
  const { NextResponse } = await import("next/server");
  return {
    tier2Service: () => ({
      status: mocks.status,
      readDraft: mocks.readDraft,
      delete: mocks.delete,
      confirm: mocks.confirm,
    }),
    contractForJob: mocks.contractForJob,
    noStore: (body: Record<string, unknown>, status = 200) => {
      const response = NextResponse.json(body, { status });
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      return response;
    },
    tier2ErrorResponse: () => NextResponse.json({ ok: false, error: "redacted" }, { status: 500 }),
  };
});

import { DELETE, GET as READ } from "./route";
import { POST as CONFIRM } from "./confirm/route";
import { GET as STATUS } from "./status/route";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  const store = {
    getExtractionJob: mocks.getExtractionJob,
    recordComputation: mocks.recordComputation,
  };
  mocks.resolveWorkspace.mockResolvedValue({
    ok: true,
    workspace: { store, firmId: FIRM_ID, principal: { userEmail: "tier2@test.in" } },
  });
  mocks.contractForJob.mockResolvedValue({ rule_id: "R" });
  mocks.getExtractionJob.mockResolvedValue({
    id: JOB_ID,
    jurisdiction: "DL",
    rule_id: "DL-TEST",
    execution_date: "2026-07-22",
  });
  mocks.compute.mockReturnValue({
    jurisdiction: "DL",
    rule_id: "DL-TEST",
    execution_date: "2026-07-22",
  });
  mocks.recordComputation.mockResolvedValue({ id: "52c13ec7-6687-4693-a6c4-072ebf33d370" });
});

describe("Tier 2 status/read/confirm/delete routes", () => {
  it("returns only the persisted redacted status", async () => {
    mocks.status.mockResolvedValue({
      id: JOB_ID,
      status: "completed",
      fields: [{ key: "consideration", kind: "value", status: "found", source_page: 2 }],
    });
    const response = await STATUS(request("status"), context());
    const body = await response.json();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(JSON.stringify(body)).not.toMatch(/proposed_value|"snippet"|1000000/);
    expect(mocks.status).toHaveBeenCalledWith(FIRM_ID, JOB_ID);
  });

  it("serves the provider draft only through the authorized no-store read route", async () => {
    mocks.readDraft.mockResolvedValue({ draft_id: JOB_ID, fields: [{ source: { snippet: "authorized source" } }] });
    const response = await READ(request(), context());
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({ ok: true, draft: { draft_id: JOB_ID } });
    expect(mocks.contractForJob).toHaveBeenCalledWith(
      expect.objectContaining({ getExtractionJob: mocks.getExtractionJob }),
      FIRM_ID,
      JOB_ID,
    );
  });

  it("confirms using server time, computes, and records the confirmed engine boundary", async () => {
    const confirmed = { values: { consideration: "100" }, facts: {}, extraction_model_version: "model-v1" };
    mocks.confirm.mockImplementation(async (args) => ({
      job: { status: "deleted" },
      confirmed,
      consumed: await args.consume(confirmed),
    }));
    const response = await CONFIRM(new NextRequest(`http://localhost/api/extractions/${JOB_ID}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        confirmation: { draft_id: JOB_ID, fields: [] },
        matter_id: "3e666b9d-d105-497a-8c7b-6ed54d3ce636",
      }),
    }), context());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      job: { status: "deleted" },
      recordId: "52c13ec7-6687-4693-a6c4-072ebf33d370",
    });
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      firmId: FIRM_ID,
      id: JOB_ID,
      confirmation: { draft_id: JOB_ID, fields: [] },
      occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    }));
    expect(mocks.compute).toHaveBeenCalledWith({}, expect.objectContaining({
      values: { consideration: "100" },
    }), {});
    expect(mocks.recordComputation).toHaveBeenCalledWith(expect.objectContaining({
      firmId: FIRM_ID,
      userEmail: "tier2@test.in",
      extractionModelVersion: "model-v1",
      recordId: JOB_ID,
    }));
  });

  it("performs user deletion through the provider lifecycle", async () => {
    mocks.delete.mockResolvedValue({ id: JOB_ID, status: "deleted", fields: [] });
    const response = await DELETE(request(), context());
    expect(response.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith(
      FIRM_ID,
      JOB_ID,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      "user_deleted",
    );
  });
});

function context() {
  return { params: { id: JOB_ID } };
}

function request(suffix = ""): NextRequest {
  return new NextRequest(`http://localhost/api/extractions/${JOB_ID}/${suffix}`);
}
