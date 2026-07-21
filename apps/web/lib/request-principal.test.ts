import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  authenticateRequest,
  createTestRequestPrincipalAdapter,
} from "./request-principal.js";

const identity = {
  firmId: "63b46723-a8a0-488d-8223-5b2aadad71b0",
  issuer: "https://identity.test",
  subject: "lawyer-1",
};

describe("provider-neutral request principals", () => {
  it("fails closed when no deployment adapter is installed", async () => {
    await expect(authenticateRequest(new Headers())).resolves.toBeNull();
  });

  it("lets the test adapter resolve only its opaque bearer token", async () => {
    const adapter = createTestRequestPrincipalAdapter("route-test-token", identity);
    await expect(authenticateRequest(new Headers(), adapter)).resolves.toBeNull();

    const headers = new Headers({ authorization: "Bearer route-test-token" });
    await expect(authenticateRequest(headers, adapter)).resolves.toEqual(identity);
  });

  it("rejects malformed identities returned by an adapter", async () => {
    await expect(authenticateRequest(new Headers(), {
      async authenticate() {
        return { ...identity, firmId: "not-a-uuid" };
      },
      async checkHealth() {
        return true;
      },
    })).rejects.toThrow(/invalid principal/);
  });
});
