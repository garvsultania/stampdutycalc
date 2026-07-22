import { describe, expect, it } from "vitest";
import { WatchdogError } from "./errors.js";
import { parseStaticDocumentIndex, parseStaticPageLinks } from "./static-index.js";

describe("static government publication indexes", () => {
  it("parses Tamil Nadu issue details and normalizes legacy backslash URLs", () => {
    const html = `
      <div>Issue 28 — 15 July 2026</div>
      <a href="gazette\\2026\\28_VI_4_2026.pdf">Part VI, Section 4 — Tamil and English</a>`;

    const rows = parseStaticDocumentIndex(html, "https://stationeryprinting.tn.gov.in/gazette_list_details.php");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      gazetteDate: "15 July 2026",
      title: "Part VI, Section 4 — Tamil and English",
      pdfTarget: "https://stationeryprinting.tn.gov.in/gazette/2026/28_VI_4_2026.pdf",
    });
  });

  it("parses direct Karnataka DPAL upload links and Tamil Nadu issue links", () => {
    const acts = parseStaticDocumentIndex(
      '<a href="/uploads/media_to_upload1748945153.pdf">Code of Civil Procedure (Karnataka Amendment) Act, 2025</a>',
      "https://dpal.karnataka.gov.in/79/2025/en",
    );
    expect(acts[0]?.pdfTarget).toBe("https://dpal.karnataka.gov.in/uploads/media_to_upload1748945153.pdf");

    const pages = parseStaticPageLinks(
      '<a href="gazette_list_details.php?id=Mjg=&amp;date=MjAyNi0wNy0xNQ==">Issue 28</a>',
      "https://stationeryprinting.tn.gov.in/gazette.php",
      /gazette_list_details\.php/i,
    );
    expect(pages).toEqual([
      "https://stationeryprinting.tn.gov.in/gazette_list_details.php?id=Mjg=&date=MjAyNi0wNy0xNQ==",
    ]);
  });

  it("fails loudly when an index changes shape", () => {
    expect(() => parseStaticDocumentIndex("<html>No publications</html>", "https://example.test/")).toThrowError(WatchdogError);
    expect(() => parseStaticPageLinks("<html>No issues</html>", "https://example.test/", /issue/)).toThrowError(WatchdogError);
  });
});
