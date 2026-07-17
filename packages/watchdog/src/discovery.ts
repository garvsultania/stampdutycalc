import { WatchdogError } from "./errors.js";
import { htmlText } from "./html.js";
import { parseTamilNaduGazettePdfs, parseTamilNaduOrdinaryIssues, tamilNaduYearUrl } from "./tamil-nadu.js";
import type { Fetcher, GazetteRow } from "./types.js";
import { assertOfficialUrl, sourceById } from "./sources.js";

export interface YearDiscovery {
  sourceId: string;
  year: number;
  rows: GazetteRow[];
  listingPages: number;
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
