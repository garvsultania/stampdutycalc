import type { DiscoveryPage, SourceAdapter, SweepRange } from "./adapter.js";
import { discoverDelhiRevenueNotifications } from "./discovery.js";
import { requirePdfBody } from "./egazette.js";
import { WatchdogError } from "./errors.js";

export function delhiRevenueNotificationsAdapter(): SourceAdapter {
  return {
    sourceId: "dl-revenue-notifications",
    async begin(fetcher, range) {
      requireSnapshotRange(range);
      const discovery = await discoverDelhiRevenueNotifications(fetcher);
      const pages: DiscoveryPage[] = discovery.pages.map((page, index) => ({
        rows: page.rows,
        pageNumber: index + 1,
        pagesExpected: discovery.listingPages,
      }));
      return {
        firstPage: pages[0]!,
        async next(current) {
          return pages[current.pageNumber];
        },
      };
    },
    verifyDocument(mediaType, body, description) {
      requirePdfBody(mediaType, body, description);
    },
  };
}

function requireSnapshotRange(range: SweepRange): void {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(range.from) || range.from !== range.to) {
    throw new WatchdogError(
      "Delhi Revenue static-listing acquisition requires identical YYYY-MM-DD observation dates",
      "shape_drift",
    );
  }
}
