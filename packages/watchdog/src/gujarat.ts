import { WatchdogError } from "./errors.js";
import { parseAspNetDocumentTable, type AspNetTablePage } from "./aspnet.js";
import type { GazetteRow } from "./types.js";

export interface GujaratRecentPage {
  ordinary: GazetteRow[];
  extraordinary: GazetteRow[];
  page: AspNetTablePage;
}

export function parseGujaratRecentGazettes(html: string, responseUrl: string, pageNumber = 1): GujaratRecentPage {
  const page = parseAspNetDocumentTable(html, responseUrl, pageNumber);
  const ordinary = page.rows.filter((row) => !row.cells.some((cell) => /Part-II\s+Extra/i.test(cell)));
  const extraordinary = page.rows.filter((row) => row.cells.some((cell) => /Part-II\s+Extra/i.test(cell)));
  if (ordinary.length === 0 || extraordinary.length === 0) {
    throw new WatchdogError(
      `Gujarat recent gazette page must contain ordinary and extraordinary rows; found ${ordinary.length}/${extraordinary.length}`,
      "shape_drift",
    );
  }
  return { ordinary, extraordinary, page };
}
