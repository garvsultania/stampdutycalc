import { WatchdogError } from "./errors.js";
import { htmlText } from "./html.js";
import { parseDelhiRevenueNotifications } from "./delhi-up.js";
import { parseKarnatakaActPage, requireKarnatakaActs, type KarnatakaActGroup } from "./karnataka.js";
import { parseTamilNaduGazettePdfs, parseTamilNaduOrdinaryIssues, tamilNaduYearUrl } from "./tamil-nadu.js";
import type { Fetcher, GazetteRow } from "./types.js";
import { assertOfficialUrl, sourceById } from "./sources.js";

export interface YearDiscovery {
  sourceId: string;
  year: number;
  rows: GazetteRow[];
  listingPages: number;
}

export const KARNATAKA_REQUIRED_ACTS = [
  { actNumber: 26, year: 2021 },
  { actNumber: 11, year: 2022 },
  { actNumber: 12, year: 2022 },
  { actNumber: 31, year: 2022 },
  { actNumber: 3, year: 2023 },
  { actNumber: 4, year: 2024 },
  { actNumber: 23, year: 2024 },
  { actNumber: 30, year: 2025 },
  { actNumber: 42, year: 2025 },
] as const;

export const KARNATAKA_DISCOVERY_YEARS = [2021, 2022, 2023, 2024, 2025, 2026] as const;

export interface KarnatakaActDiscovery {
  sourceId: "ka-dpal-acts";
  years: number[];
  groups: KarnatakaActGroup[];
  listingPages: number;
}

export interface DelhiRevenueDiscovery {
  sourceId: "dl-revenue-notifications";
  rows: GazetteRow[];
  pages: Array<{ url: string; rows: GazetteRow[] }>;
  listingPages: number;
  listingUrls: string[];
}

export function karnatakaActYearUrl(year: number): string {
  if (!Number.isSafeInteger(year) || year < 2000 || year > 2100) {
    throw new WatchdogError(`Invalid Karnataka DPAL Act year: ${year}`, "shape_drift");
  }
  return `https://dpal.karnataka.gov.in/79/${year}/en`;
}

/** Fetch every required annual DPAL page before asserting the known Act
 * checklist. Constructing a candidate URL proves nothing; only a successful,
 * parsed first-party response contributes a group. */
export async function discoverKarnatakaRequiredActs(fetcher: Fetcher): Promise<KarnatakaActDiscovery> {
  const source = sourceById("ka-dpal-acts");
  const years = [...KARNATAKA_DISCOVERY_YEARS];
  const groups: KarnatakaActGroup[] = [];
  for (const year of years) {
    const url = karnatakaActYearUrl(year);
    assertOfficialUrl(source, url);
    const response = await fetcher.request({ url });
    assertOfficialUrl(source, response.url);
    const yearGroups = parseKarnatakaActPage(htmlText(response.body), response.url);
    if (yearGroups.some((group) => group.year !== year)) {
      throw new WatchdogError(`Karnataka DPAL ${year} page exposed a different Act year`, "shape_drift");
    }
    for (const group of yearGroups) {
      for (const row of group.rows) assertOfficialUrl(source, row.pdfRequest.url);
    }
    groups.push(...yearGroups);
  }
  requireKarnatakaActs(groups, [...KARNATAKA_REQUIRED_ACTS]);
  return { sourceId: "ka-dpal-acts", years, groups, listingPages: years.length };
}

/** Traverse every pagination URL exposed by Delhi Revenue while fetching only
 * listing HTML. PDF rows are discovered and allowlist-checked, not downloaded. */
export async function discoverDelhiRevenueNotifications(
  fetcher: Fetcher,
  maxPages = 100,
): Promise<DelhiRevenueDiscovery> {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new WatchdogError(`Invalid Delhi Revenue page bound: ${maxPages}`, "shape_drift");
  }
  const source = sourceById("dl-revenue-notifications");
  const queue = [source.baseUrl];
  const visited = new Set<string>();
  const rows = new Map<string, GazetteRow>();
  const pages: DelhiRevenueDiscovery["pages"] = [];
  while (queue.length > 0) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    if (visited.size >= maxPages) {
      throw new WatchdogError(`Delhi Revenue pagination exceeded ${maxPages} listing pages`, "shape_drift");
    }
    assertOfficialUrl(source, url);
    const response = await fetcher.request({ url });
    assertOfficialUrl(source, response.url);
    visited.add(url);
    const page = parseDelhiRevenueNotifications(htmlText(response.body), response.url);
    const newRows: GazetteRow[] = [];
    for (const row of page.rows) {
      assertOfficialUrl(source, row.pdfRequest.url);
      if (!rows.has(row.sourceRowId)) {
        rows.set(row.sourceRowId, row);
        newRows.push(row);
      }
    }
    pages.push({ url, rows: newRows });
    for (const pageUrl of page.pages) {
      assertOfficialUrl(source, pageUrl);
      const canonicalPageUrl = canonicalDelhiListingUrl(pageUrl, source.baseUrl);
      if (!visited.has(canonicalPageUrl) && !queue.includes(canonicalPageUrl)) queue.push(canonicalPageUrl);
    }
  }
  if (rows.size === 0) throw new WatchdogError("Delhi Revenue traversal discovered no PDFs", "shape_drift");
  return {
    sourceId: "dl-revenue-notifications",
    rows: [...rows.values()].sort((left, right) => left.sourceRowId.localeCompare(right.sourceRowId)),
    pages,
    listingPages: visited.size,
    listingUrls: [...visited].sort(),
  };
}

function canonicalDelhiListingUrl(value: string, root: string): string {
  const url = new URL(value);
  if (url.searchParams.get("page") === "0") return root;
  url.hash = "";
  return url.toString();
}

export async function discoverTamilNaduYear(
  fetcher: Fetcher,
  sourceId: "tn-gazette-ordinary" | "tn-gazette-extraordinary",
  year: number,
): Promise<YearDiscovery> {
  const source = sourceById(sourceId);
  const kind = sourceId.endsWith("extraordinary") ? "extraordinary" : "ordinary";
  const yearUrl = tamilNaduYearUrl(kind, year);
  assertOfficialUrl(source, yearUrl);
  const response = await fetcher.request({ url: yearUrl });
  assertOfficialUrl(source, response.url);
  const html = htmlText(response.body);
  if (kind === "extraordinary") {
    const rows = parseTamilNaduGazettePdfs(html, response.url);
    for (const row of rows) assertOfficialUrl(source, row.pdfRequest.url);
    return { sourceId, year, rows, listingPages: 1 };
  }

  const issueUrls = parseTamilNaduOrdinaryIssues(html, response.url);
  const rows: GazetteRow[] = [];
  for (const issueUrl of issueUrls) {
    assertOfficialUrl(source, issueUrl);
    const issue = await fetcher.request({ url: issueUrl });
    assertOfficialUrl(source, issue.url);
    rows.push(...parseTamilNaduGazettePdfs(htmlText(issue.body), issue.url));
  }
  if (rows.length === 0) throw new WatchdogError(`Tamil Nadu ordinary ${year} discovery returned no PDFs`, "shape_drift");
  return { sourceId, year, rows, listingPages: issueUrls.length + 1 };
}
