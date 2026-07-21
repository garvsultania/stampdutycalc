import { describe, expect, it, vi } from "vitest";
import {
  hostnameFromHostHeader,
  issueMemoCapability,
  issueMemoCapabilityForRecord,
  resolveMemoCapabilitySecret,
  verifyMemoCapability,
} from "./memo-capability.js";

const SECRET = "test-only-memo-capability-secret-0000000001";
const OTHER_SECRET = "other-test-memo-capability-secret-00000002";
const RECORD_ID = "d5dbdb5a-4644-47b8-9dfc-12ff54fa18dc";
const OTHER_RECORD_ID = "44cbec00-dc03-4cee-aaf1-1ee17a0f05c6";
const FIRM_ID = "63b46723-a8a0-488d-8223-5b2aadad71b0";
const OTHER_FIRM_ID = "a89db611-1353-423d-ab0c-087cb42fc638";
const NOW = Date.parse("2026-07-20T12:00:00.000Z");

describe("memo capabilities", () => {
  it("round-trips only opaque identifiers and bounded timing metadata", () => {
    const token = issueMemoCapability({
      secret: SECRET,
      recordId: RECORD_ID,
      firmId: FIRM_ID,
      nowMs: NOW,
    });
    const payload = verifyMemoCapability(token, {
      secret: SECRET,
      expectedFirmId: FIRM_ID,
      nowMs: NOW + 60_000,
    });

    expect(payload).toEqual({
      version: 1,
      purpose: "computation_memo",
      recordId: RECORD_ID,
      firmId: FIRM_ID,
      issuedAt: Math.floor(NOW / 1000),
      expiresAt: Math.floor(NOW / 1000) + 300,
    });
    const decoded = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8"));
    expect(Object.keys(decoded).sort()).toEqual([
      "expiresAt",
      "firmId",
      "issuedAt",
      "purpose",
      "recordId",
      "version",
    ]);
    expect(JSON.stringify(decoded)).not.toContain("Acme HQ acquisition");
    expect(`/memo?token=${encodeURIComponent(token)}`).not.toContain("consideration");
  });

  it("refuses tampering, the wrong secret, expiry, and cross-firm use", () => {
    const token = issueMemoCapability({
      secret: SECRET,
      recordId: RECORD_ID,
      firmId: FIRM_ID,
      nowMs: NOW,
    });
    const [payload, signature] = token.split(".");
    const tamperedSignature = `${signature![0] === "A" ? "B" : "A"}${signature!.slice(1)}`;

    expect(() => verifyMemoCapability(`${payload}.${tamperedSignature}`, {
      secret: SECRET,
      expectedFirmId: FIRM_ID,
      nowMs: NOW,
    })).toThrow(/signature/);
    expect(() => verifyMemoCapability(token, {
      secret: OTHER_SECRET,
      expectedFirmId: FIRM_ID,
      nowMs: NOW,
    })).toThrow(/signature/);
    expect(() => verifyMemoCapability(token, {
      secret: SECRET,
      expectedFirmId: FIRM_ID,
      nowMs: NOW + 300_000,
    })).toThrow(/expired/);
    expect(() => verifyMemoCapability(token, {
      secret: SECRET,
      expectedFirmId: OTHER_FIRM_ID,
      nowMs: NOW,
    })).toThrow(/not valid for this firm/);
  });

  it("issues only after a record exists inside the requested firm", async () => {
    const getComputation = vi.fn(async (firmId: string, recordId: string) =>
      firmId === FIRM_ID && recordId === RECORD_ID ? { id: recordId } : null,
    );
    const store = { getComputation };

    await expect(issueMemoCapabilityForRecord(store, {
      secret: SECRET,
      recordId: RECORD_ID,
      firmId: FIRM_ID,
      nowMs: NOW,
    })).resolves.toEqual(expect.any(String));
    await expect(issueMemoCapabilityForRecord(store, {
      secret: SECRET,
      recordId: OTHER_RECORD_ID,
      firmId: FIRM_ID,
      nowMs: NOW,
    })).resolves.toBeNull();
    await expect(issueMemoCapabilityForRecord(store, {
      secret: SECRET,
      recordId: RECORD_ID,
      firmId: OTHER_FIRM_ID,
      nowMs: NOW,
    })).resolves.toBeNull();
    await expect(issueMemoCapabilityForRecord(store, {
      secret: SECRET,
      recordId: "not-a-uuid",
      firmId: FIRM_ID,
      nowMs: NOW,
    })).resolves.toBeNull();
    expect(getComputation).toHaveBeenCalledTimes(3);
  });

  it("requires a strong configured secret except on loopback development", () => {
    expect(resolveMemoCapabilitySecret({
      configured: SECRET,
      nodeEnv: "production",
      hostname: "stampdraft.example",
    })).toBe(SECRET);
    expect(() => resolveMemoCapabilitySecret({
      nodeEnv: "production",
      hostname: "localhost",
    })).toThrow(/required in production/);
    expect(() => resolveMemoCapabilitySecret({
      nodeEnv: "development",
      hostname: "stampdraft.example",
    })).toThrow(/outside loopback/);
    expect(() => resolveMemoCapabilitySecret({
      configured: "too-short",
      nodeEnv: "development",
      hostname: "localhost",
    })).toThrow(/at least 32 bytes/);
    expect(resolveMemoCapabilitySecret({
      nodeEnv: "development",
      hostname: "127.0.0.1",
    }).length).toBeGreaterThanOrEqual(32);
  });

  it("extracts loopback hostnames without trusting ports", () => {
    expect(hostnameFromHostHeader("localhost:3100")).toBe("localhost");
    expect(hostnameFromHostHeader("[::1]:3100")).toBe("::1");
    expect(hostnameFromHostHeader(null)).toBeUndefined();
  });
});
