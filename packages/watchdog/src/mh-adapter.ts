import { aspNetSession, type SourceAdapter } from "./adapter.js";
import {
  beginSearch,
  fetchNextPage,
  MH_PART4B_SELECTION,
  MH_PART8_SELECTION,
  requirePdf,
  type MaharashtraGazetteSelection,
} from "./egazette.js";
import type { GazettePage } from "./types.js";

export function mhPart8Adapter(): SourceAdapter {
  return mhGazetteAdapter("mh-egazette-part8", MH_PART8_SELECTION);
}

export function mhPart4bAdapter(): SourceAdapter {
  return mhGazetteAdapter("mh-egazette-part4b", MH_PART4B_SELECTION);
}

function mhGazetteAdapter(sourceId: string, selection: MaharashtraGazetteSelection): SourceAdapter {
  return {
    sourceId,
    async begin(fetcher, range) {
      const session = await beginSearch(fetcher, range, selection);
      return aspNetSession(session.firstPage, async (current: GazettePage) => {
        if (!current.nextPostBack) return undefined;
        return (await fetchNextPage(fetcher, current, session.searchFormValues)).page;
      });
    },
    verifyDocument(mediaType, body, description) {
      requirePdf({
        url: "https://egazzete.mahaonline.gov.in/",
        status: 200,
        mediaType,
        body,
        headers: {},
        request: { method: "GET", url: "https://egazzete.mahaonline.gov.in/" },
      }, description);
    },
  };
}
