import { describe, expect, it } from "vitest";
import { parseTamilNaduGazettePdfs, parseTamilNaduOrdinaryIssues, tamilNaduYearUrl } from "./tamil-nadu.js";

describe("Tamil Nadu official gazettes", () => {
  it("constructs direct year URLs without scraping an indirect index", () => {
    expect(tamilNaduYearUrl("ordinary", 2026)).toBe(
      "https://stationeryprinting.tn.gov.in/Gazette_Publications_2008.php?id=MjAyNg%3D%3D",
    );
    expect(tamilNaduYearUrl("extraordinary", 2026)).toBe(
      "https://stationeryprinting.tn.gov.in/extra_ordinary_lists.php?id=MjAyNg%3D%3D",
    );
  });

  it("parses ordinary issue pages and direct extraordinary PDFs", () => {
    const issues = parseTamilNaduOrdinaryIssues(
      '<a href="gazette_list_details.php?id=Mjg=&amp;date=MjAyNi0wNy0xNQ==">Issue 28</a>',
      "https://stationeryprinting.tn.gov.in/gazette.php",
    );
    expect(issues).toHaveLength(1);

    const rows = parseTamilNaduGazettePdfs(
      '<div>Issue 310 — 14-07-2026</div><a href="http://www.stationeryprinting.tn.gov.in/extraordinary/2026/310_Ex_II_2_2026.pdf">Part II, Sec. 2</a>',
      "https://stationeryprinting.tn.gov.in/extra_ordinary_lists.php?id=MjAyNg==",
    );
    expect(rows[0]).toMatchObject({
      gazetteDate: "14-07-2026",
      pdfTarget: "https://www.stationeryprinting.tn.gov.in/extraordinary/2026/310_Ex_II_2_2026.pdf",
    });
  });
});
