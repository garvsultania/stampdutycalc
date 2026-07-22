import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("liveness endpoint", () => {
  it("returns only the process liveness contract", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true, status: "live" });
  });
});
