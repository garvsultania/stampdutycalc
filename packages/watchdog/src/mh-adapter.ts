import { aspNetSession, type SourceAdapter } from "./adapter.js";
import { beginSearch, fetchNextPage, requirePdf } from "./egazette.js";
import type { GazettePage } from "./types.js";

export function mhPart8Adapter(): SourceAdapter {
  return {
    sourceId: "mh-egazette-part8",
    async begin(fetcher, range) {
      const session = await beginSearch(fetcher, range);
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
