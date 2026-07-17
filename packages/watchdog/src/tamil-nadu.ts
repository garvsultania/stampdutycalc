import { WatchdogError } from "./errors.js";
import { parseStaticDocumentIndex, parseStaticPageLinks } from "./static-index.js";
import type { GazetteRow } from "./types.js";

export function tamilNaduYearUrl(kind: "ordinary" | "extraordinary", year: number): string {
  if (!Number.isSafeInteger(year) || year < 2008 || year > 2100) {
    throw new WatchdogError(`Invalid Tamil Nadu gazette year ${year}`, "shape_drift");
  }
  const id = Buffer.from(String(year), "utf8").toString("base64");
  return kind === "ordinary"
    ? `https://stationeryprinting.tn.gov.in/Gazette_Publications_2008.php?id=${encodeURIComponent(id)}`
    : `https://stationeryprinting.tn.gov.in/extra_ordinary_lists.php?id=${encodeURIComponent(id)}`;
}

export function parseTamilNaduOrdinaryIssues(html: string, responseUrl: string): string[] {
  return parseStaticPageLinks(html, responseUrl, /gazette_list_details\.php/i);
}

export function parseTamilNaduGazettePdfs(html: string, responseUrl: string): GazetteRow[] {
  const rows = parseStaticDocumentIndex(html, responseUrl, {
    linkPattern: /\/(?:gazette|extraordinary)\/20\d{2}\/[^?#]+\.pdf(?:$|[?#])/i,
  });
  for (const row of rows) {
    const url = new URL(row.pdfRequest.url);
    if (url.protocol === "http:") url.protocol = "https:";
    row.pdfTarget = url.toString();
    row.pdfRequest = { url: url.toString() };
  }
  return rows;
}
