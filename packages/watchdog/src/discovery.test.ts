import { describe, expect, it } from "vitest";
import {
  discoverDelhiRevenueNotifications,
  discoverKarnatakaRequiredActs,
  discoverTamilNaduYear,
} from "./discovery.js";
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

class KarnatakaFixtures implements Fetcher {
  async request(spec: RequestSpec): Promise<ResponseRecord> {
    const year = Number(spec.url.match(/\/(20\d{2})\/en$/)?.[1]);
    const required: Record<number, number[]> = {
      2021: [26],
      2022: [11, 12, 31],
      2023: [3],
      2024: [4, 23],
      2025: [30, 42],
      2026: [1],
    };
    const links = (required[year] ?? []).map((act) =>
      `<a href="/uploads/media_to_upload${year}${act}.pdf">KARNATAKA ACT NO. ${act} OF ${year}</a>`
    ).join("");
    return response(spec.url, links);
  }
}

class DelhiFixtures implements Fetcher {
  async request(spec: RequestSpec): Promise<ResponseRecord> {
    if (spec.url.endsWith("?page=1")) {
      return response(spec.url, `
        <a href="/sites/default/files/revenue/second.pdf">Second notification</a>
        <a href="?page=0">Previous</a>`);
    }
    return response(spec.url, `
      <a href="/sites/default/files/revenue/first.pdf">First notification</a>
      <a href="?page=1">Next</a>`);
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

  it("fetches every Karnataka annual page before enforcing the known Act checklist", async () => {
    const result = await discoverKarnatakaRequiredActs(new KarnatakaFixtures());
    expect(result).toMatchObject({ listingPages: 6, years: [2021, 2022, 2023, 2024, 2025, 2026] });
    expect(result.groups.map((group) => `${group.actNumber}/${group.year}`)).toEqual([
      "26/2021",
      "11/2022",
      "12/2022",
      "31/2022",
      "3/2023",
      "4/2024",
      "23/2024",
      "30/2025",
      "42/2025",
      "1/2026",
    ]);
  });

  it("traverses Delhi Revenue pagination once without downloading PDFs", async () => {
    const result = await discoverDelhiRevenueNotifications(new DelhiFixtures());
    expect(result).toMatchObject({ listingPages: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.listingUrls).toEqual([
      "https://revenue.delhi.gov.in/revenue/notification",
      "https://revenue.delhi.gov.in/revenue/notification?page=1",
    ]);
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
