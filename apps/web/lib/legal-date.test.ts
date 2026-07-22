import { describe, expect, it } from "vitest";
import { indiaTodayISO } from "./legal-date.js";

describe("Indian legal date", () => {
  it("uses the Indian civil date rather than the deployment server's UTC date", () => {
    expect(indiaTodayISO(new Date("2026-07-18T20:00:00.000Z"))).toBe("2026-07-19");
  });

  it("does not advance before Indian midnight", () => {
    expect(indiaTodayISO(new Date("2026-07-18T18:29:59.999Z"))).toBe("2026-07-18");
  });
});
