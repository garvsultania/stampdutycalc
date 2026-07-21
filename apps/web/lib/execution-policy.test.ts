import { describe, expect, it } from "vitest";
import {
  LOCAL_DRAFT_ACK,
  LOCAL_DRAFT_POLICY,
  resolveExecutionPolicy,
} from "./execution-policy.js";

describe("legal execution policy", () => {
  it("defaults to founder-verified and evidence-backed execution regardless of NODE_ENV", () => {
    expect(resolveExecutionPolicy({ nodeEnv: "development", hostname: "example.test" })).toMatchObject({
      requireVerified: true,
      requireEvidence: true,
    });
  });

  it("requires an explicit acknowledgement and loopback host for draft mode", () => {
    expect(() => resolveExecutionPolicy({
      configured: LOCAL_DRAFT_POLICY,
      nodeEnv: "development",
      hostname: "localhost",
    })).toThrow(/explicit UNVERIFIED_LOCAL_ONLY acknowledgement/);
    expect(() => resolveExecutionPolicy({
      configured: LOCAL_DRAFT_POLICY,
      acknowledgement: LOCAL_DRAFT_ACK,
      nodeEnv: "development",
      hostname: "stampdraft.example",
    })).toThrow(/loopback requests only/);
  });

  it("never permits draft mode in a production process", () => {
    expect(() => resolveExecutionPolicy({
      configured: LOCAL_DRAFT_POLICY,
      acknowledgement: LOCAL_DRAFT_ACK,
      nodeEnv: "production",
      hostname: "127.0.0.1",
    })).toThrow(/disabled when NODE_ENV=production/);
  });

  it("permits deliberately acknowledged local draft execution", () => {
    expect(resolveExecutionPolicy({
      configured: LOCAL_DRAFT_POLICY,
      acknowledgement: LOCAL_DRAFT_ACK,
      nodeEnv: "development",
      hostname: "::1",
    })).toMatchObject({ requireVerified: false, requireEvidence: false });
  });
});
