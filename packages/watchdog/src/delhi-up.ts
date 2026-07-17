import { WatchdogError } from "./errors.js";
import { parseStaticDocumentIndex, parseStaticPageLinks } from "./static-index.js";
import type { GazetteRow } from "./types.js";

export function parseDelhiRevenueNotifications(html: string, responseUrl: string): { rows: GazetteRow[]; pages: string[] } {
  const rows = parseStaticDocumentIndex(html, responseUrl, {
    linkPattern: /\/sites\/default\/files\/revenue\/[^?#]+\.pdf(?:$|[?#])/i,
  });
  const pages = parseStaticPageLinks(html, responseUrl, /[?&]page=\d+/i);
  return { rows, pages };
}

export const UP_IGRSUP_ENTRY_POINTS = [
  { id: "stamp-act-hi", path: "StampAdhiniyamHindi" },
  { id: "stamp-act-en", path: "StampAdhiniyamEnglish" },
  { id: "stamp-rules-hi", path: "UPStampAdhiniyamruleHindi" },
  { id: "stamp-rules-en", path: "UPStampAdhiniyamrule" },
  { id: "registration-fees-hi", path: "RegistryFeeAdhiniyamrule" },
  { id: "registration-fees-en", path: "RegistryFeeAdhiniyamruleEnglish" },
  { id: "amendments-clarifications", path: "prernadoc/shasnaAdesh/GO%20final/niyamawali.html" },
  { id: "valuation-orders", path: "prernadoc/shasnaAdesh/GO%20final/mulyankan.html" },
  { id: "stamp-disputes", path: "prernadoc/shasnaAdesh/GO%20final/stampvaad.html" },
] as const;

export function upIgrsupUrl(path: string): string {
  const url = new URL(path, "https://igrsup.gov.in/igrsup/");
  if (url.protocol !== "https:" || url.hostname !== "igrsup.gov.in") {
    throw new WatchdogError(`UP IGRSUP path left the official host: ${path}`, "shape_drift");
  }
  return url.toString();
}
