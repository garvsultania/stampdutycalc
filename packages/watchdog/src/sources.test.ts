import { describe, expect, it } from "vitest";
import { WatchdogError } from "./errors.js";
import { assertOfficialUrl, listSources, sourceById, validateSourceDefinition, type SourceDefinition } from "./sources.js";

describe("watchdog source registry", () => {
  it("contains only unique first-party HTTPS government sources", () => {
    const sources = listSources();

    expect(sources).toHaveLength(10);
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

  it("registers IGR Maharashtra as provisional departmental publications, not a complete spine", () => {
    expect(sourceById("mh-igr-publications")).toMatchObject({
      adapter: "static_index",
      publication: "department_orders",
      allowedHosts: ["igrmaharashtra.gov.in"],
    });
    expect(sourceById("mh-igr-publications").description).toMatch(/does not establish history or currency/i);
  });

  it("describes the accepted Part IV-B baseline and exact historical gap without declaring status", () => {
    expect(sourceById("mh-egazette-part4b")).toMatchObject({
      publication: "gazette",
      allowedHosts: ["egazzete.mahaonline.gov.in"],
    });
    expect("status" in sourceById("mh-egazette-part4b")).toBe(false);
    expect(sourceById("mh-egazette-part4b").description).toMatch(/2021-07-17 through 2026-07-19/i);
    expect(sourceById("mh-egazette-part4b").description).toMatch(/2015 through 2020/i);
    expect(sourceById("mh-egazette-part4b").description).toMatch(/one explicitly identified inaccessible document/i);
  });

  it("labels Telangana GOIR as orders, not complete gazette coverage", () => {
    expect(sourceById("tg-goir-revenue")).toMatchObject({
      publication: "department_orders",
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
