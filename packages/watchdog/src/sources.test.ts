import { describe, expect, it } from "vitest";
import { WatchdogError } from "./errors.js";
import { assertOfficialUrl, listSources, sourceById, validateSourceDefinition, type SourceDefinition } from "./sources.js";

describe("watchdog source registry", () => {
  it("contains only unique first-party HTTPS government sources", () => {
    const sources = listSources();

    expect(sources).toHaveLength(9);
    expect(new Set(sources.map((source) => source.id))).toHaveLength(sources.length);
    expect(new Set(sources.map((source) => source.jurisdiction))).toEqual(
      new Set(["DL", "GJ", "KA", "MH", "TG", "TN", "UP"]),
    );
    for (const source of sources) {
      expect(source.authority).toBe("official_government");
      expect(source.baseUrl).toMatch(/^https:\/\//);
      expect(source.description).not.toMatch(/commercial|tracker|blog|mirror/i);
      expect(() => validateSourceDefinition(source)).not.toThrow();
    }
  });

  it("keeps Maharashtra Part IV-B provisional until full acquisition completes", () => {
    expect(sourceById("mh-egazette-part4b")).toMatchObject({
      publication: "gazette",
      status: "provisional",
      allowedHosts: ["egazzete.mahaonline.gov.in"],
    });
    expect(sourceById("mh-egazette-part4b").description).toMatch(/full document acquisition is not yet complete/i);
  });

  it("labels Telangana GOIR as orders, not complete gazette coverage", () => {
    expect(sourceById("tg-goir-revenue")).toMatchObject({
      publication: "department_orders",
      status: "provisional",
    });
    expect(sourceById("tg-goir-revenue").description).toMatch(/does not claim complete gazette coverage/i);
  });

  it("rejects indirect or insecure source definitions", () => {
    const invalid: SourceDefinition = {
      id: "up-commercial-tracker",
      jurisdiction: "UP",
      name: "Indirect tracker",
      owner: "Example",
      baseUrl: "http://example.test",
      allowedHosts: ["example.test"],
      adapter: "static_index",
      publication: "acts",
      status: "provisional",
      authority: "official_government",
      languages: ["en"],
      ocr: "never",
      description: "Not evidence",
    };

    expect(() => validateSourceDefinition(invalid)).toThrowError(WatchdogError);
    expect(() => sourceById("unknown-source")).toThrowError(WatchdogError);
  });

  it("refuses document URLs that leave an official source allowlist", () => {
    const source = sourceById("ka-dpal-acts");
    expect(() => assertOfficialUrl(source, "https://dpal.karnataka.gov.in/uploads/act.pdf")).not.toThrow();
    expect(() => assertOfficialUrl(source, "https://commercial-tracker.example/act.pdf")).toThrowError(WatchdogError);
    expect(() => assertOfficialUrl(source, "http://dpal.karnataka.gov.in/uploads/act.pdf")).toThrowError(WatchdogError);
  });
});
