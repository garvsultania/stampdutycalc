import { createHash } from "node:crypto";
import { aspNetSession, type SourceAdapter } from "./adapter.js";
import {
  beginSearch,
  fetchNextPage,
  MH_PART4B_SELECTION,
  MH_PART8_SELECTION,
  requirePdfBody,
  type MaharashtraGazetteSelection,
} from "./egazette.js";
import type { GazettePage, GazetteRow } from "./types.js";

export function mhPart8Adapter(): SourceAdapter {
  return mhGazetteAdapter("mh-egazette-part8", MH_PART8_SELECTION, true);
}

export function mhPart4bAdapter(): SourceAdapter {
  return mhGazetteAdapter("mh-egazette-part4b", MH_PART4B_SELECTION, true);
}

function mhGazetteAdapter(
  sourceId: string,
  selection: MaharashtraGazetteSelection,
  stableRowIdentity: boolean,
): SourceAdapter {
  return {
    sourceId,
    async begin(fetcher, range) {
      const session = await beginSearch(fetcher, range, selection);
      return aspNetSession(session.firstPage, async (current: GazettePage) => {
        if (!current.nextPostBack) return undefined;
        return (await fetchNextPage(fetcher, current, session.searchFormValues)).page;
      });
    },
    ...(stableRowIdentity ? { finalizeRows: stabilizeMhGazetteRows } : {}),
    verifyDocument(mediaType, body, description) {
      requirePdfBody(mediaType, body, description);
    },
  };
}

export function stabilizeMhGazetteRows(rows: GazetteRow[]): void {
  const occurrences = new Map<string, number>();
  for (const row of rows) {
    const stableTitle = mhGazetteStableTitle(row.title);
    const occurrence = occurrences.get(stableTitle) ?? 0;
    occurrences.set(stableTitle, occurrence + 1);
    row.sourceRowId = mhGazetteStableRowId(stableTitle, occurrence);
  }
}

export function mhGazetteStableTitle(title: string): string {
  return title.replace(/^\s*\d+\s*\|\s*/, "");
}

export function mhGazetteStableRowId(stableTitle: string, occurrence: number): string {
  return createHash("sha256").update(JSON.stringify({ title: stableTitle, occurrence })).digest("hex");
}
