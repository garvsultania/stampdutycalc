import { describe, expect, it } from "vitest";
import { discoverTamilNaduYear } from "./discovery.js";
import type { Fetcher, RequestSpec, ResponseRecord } from "./types.js";

class TamilNaduFixtures implements Fetcher {
  async request(spec: RequestSpec): Promise<ResponseRecord> {
    if (spec.url.includes("Gazette_Publications_2008")) {
      return response(spec.url, '<a href="gazette_list_details.php?id=MQ==&amp;date=MjAyNi0wMS0wNw==">Issue 1</a>');
    }
    if (spec.url.includes("gazette_list_details")) {
      return response(spec.url, '<a href="gazette/2026/1_II_2_2026.pdf">Part II</a>');
    }
    return response(spec.url, '<a href="extraordinary/2026/310_Ex_II_2_2026.pdf">Part II Extra</a>');
  }
}

describe("five-year discovery primitives", () => {
  it("traverses Tamil Nadu ordinary issue details without fetching PDFs", async () => {
    const result = await discoverTamilNaduYear(new TamilNaduFixtures(), "tn-gazette-ordinary", 2026);
    expect(result).toMatchObject({ year: 2026, listingPages: 2 });
    expect(result.rows[0]?.pdfRequest.url).toBe("https://stationeryprinting.tn.gov.in/gazette/2026/1_II_2_2026.pdf");
  });

  it("discovers extraordinary PDFs directly from a year page", async () => {
    const result = await discoverTamilNaduYear(new TamilNaduFixtures(), "tn-gazette-extraordinary", 2026);
    expect(result).toMatchObject({ year: 2026, listingPages: 1 });
    expect(result.rows).toHaveLength(1);
  });
});

function response(url: string, body: string): ResponseRecord {
  return {
    url,
    status: 200,
    mediaType: "text/html",
    body: new TextEncoder().encode(body),
    headers: {},
    request: { method: "GET", url },
  };
}
