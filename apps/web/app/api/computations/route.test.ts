import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const FIRM_ID = "63b46723-a8a0-488d-8223-5b2aadad71b0";
const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  recordComputation: vi.fn(),
  compute: vi.fn(),
  buildSnapshot: vi.fn(),
  createSnapshotArchive: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@stampdraft/engine", async (importOriginal) => ({
  ...await importOriginal<typeof import("@stampdraft/engine")>(),
  compute: mocks.compute,
  buildSnapshot: mocks.buildSnapshot,
  createSnapshotArchive: mocks.createSnapshotArchive,
}));
vi.mock("@/lib/rules-server", () => ({ getCorpus: () => ({ corpus: { ruleSet: {} } }) }));
vi.mock("@/lib/execution-policy", () => ({ executionPolicyForRequest: () => ({}) }));
vi.mock("@/lib/api-workspace", async () => {
  const { NextResponse } = await import("next/server");
  return {
    resolveWorkspace: mocks.resolveWorkspace,
    internalErrorResponse: (error = "request could not be completed", status = 500) =>
      NextResponse.json({ ok: false, error }, { status }),
  };
});

import { POST } from "./route";

const output = {
  jurisdiction: "DL",
  execution_date: "2026-07-22",
  rules_version: "sha256:test",
  inputs_echo: { values: {}, facts: {} },
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.resolveWorkspace.mockResolvedValue({
    ok: true,
    workspace: {
      firmId: FIRM_ID,
      principal: { userEmail: "member@firm.in" },
      store: { recordComputation: mocks.recordComputation },
    },
  });
  mocks.compute.mockReturnValue(output);
  mocks.buildSnapshot.mockReturnValue({ snapshot: true });
  mocks.createSnapshotArchive.mockReturnValue({ archive: true });
  mocks.recordComputation.mockResolvedValue({ id: "record-1" });
});

describe("firm-scoped filed computation route", () => {
  it("authorizes before computing and records the stored membership identity", async () => {
    const request = post();
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.resolveWorkspace).toHaveBeenCalledWith(request);
    expect(mocks.resolveWorkspace.mock.invocationCallOrder[0]).toBeLessThan(mocks.compute.mock.invocationCallOrder[0]!);
    expect(mocks.recordComputation).toHaveBeenCalledWith(expect.objectContaining({
      firmId: FIRM_ID,
      matterId: "matter-1",
      userEmail: "member@firm.in",
      extractionModelVersion: null,
    }));
  });

  it("redacts store failures", async () => {
    mocks.recordComputation.mockRejectedValue(new Error("password=secret host=private-db"));
    const response = await POST(post());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "could not record computation" });
    expect(JSON.stringify(body)).not.toMatch(/password|secret|private-db/i);
  });
});

function post(): NextRequest {
  return new NextRequest("http://localhost:3100/api/computations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      matterId: "matter-1",
      input: { jurisdiction: "DL", rule_id: "R", execution_date: "2026-07-22", values: {}, facts: {} },
    }),
  });
}
