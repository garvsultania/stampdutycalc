import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const FIRM_ID = "63b46723-a8a0-488d-8223-5b2aadad71b0";
const mocks = vi.hoisted(() => ({ resolveWorkspace: vi.fn(), createMatter: vi.fn() }));

vi.mock("@/lib/api-workspace", async () => {
  const { NextResponse } = await import("next/server");
  return {
    resolveWorkspace: mocks.resolveWorkspace,
    internalErrorResponse: (error = "request could not be completed", status = 500) =>
      NextResponse.json({ ok: false, error }, { status }),
  };
});

import { POST } from "./route";

beforeEach(() => {
  mocks.resolveWorkspace.mockReset();
  mocks.createMatter.mockReset();
  mocks.resolveWorkspace.mockResolvedValue({
    ok: true,
    workspace: {
      firmId: FIRM_ID,
      principal: { userEmail: "member@firm.in" },
      store: { createMatter: mocks.createMatter },
    },
  });
});

describe("firm-scoped matter route", () => {
  it("uses the authorized membership email rather than a caller-supplied identity", async () => {
    mocks.createMatter.mockResolvedValue({ id: "matter-1" });
    const request = post({ reference: "M-001", title: "Acquisition", createdBy: "attacker@elsewhere.in" });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.resolveWorkspace).toHaveBeenCalledWith(request);
    expect(mocks.createMatter).toHaveBeenCalledWith({
      firmId: FIRM_ID,
      reference: "M-001",
      title: "Acquisition",
      client: null,
      createdBy: "member@firm.in",
    });
  });

  it("does not return database details", async () => {
    mocks.createMatter.mockRejectedValue(new Error("connection refused postgres://admin:secret@private-db"));
    const response = await POST(post({ reference: "M-002", title: "Lease" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, error: "could not create matter" });
    expect(JSON.stringify(body)).not.toMatch(/postgres|private-db|secret|connection refused/i);
  });
});

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3100/api/matters", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
