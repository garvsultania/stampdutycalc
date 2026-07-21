import type { DiscoveryPage, SourceAdapter, SweepRange } from "./adapter.js";
import { discoverKarnatakaRequiredActs, KARNATAKA_DISCOVERY_YEARS } from "./discovery.js";
import { requirePdfBody } from "./egazette.js";
import { WatchdogError } from "./errors.js";

export function karnatakaActsAdapter(): SourceAdapter {
  return {
    sourceId: "ka-dpal-acts",
    async begin(fetcher, range) {
      requireKarnatakaAnnualRange(range);
      const discovery = await discoverKarnatakaRequiredActs(fetcher);
      const pages: DiscoveryPage[] = discovery.years.map((year, index) => ({
        rows: discovery.groups.filter((group) => group.year === year).flatMap((group) => group.rows),
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

function requireKarnatakaAnnualRange(range: SweepRange): void {
  const fromYear = year(range.from, "from");
  const toYear = year(range.to, "to");
  const firstYear = KARNATAKA_DISCOVERY_YEARS[0];
  const lastYear = KARNATAKA_DISCOVERY_YEARS.at(-1)!;
  if (fromYear !== firstYear || toYear !== lastYear) {
    throw new WatchdogError(
      `Karnataka DPAL acquisition requires a ${firstYear} through ${lastYear} annual range`,
      "shape_drift",
    );
  }
}

function year(value: string, label: string): number {
  const match = value.match(/^(20\d{2})-\d{2}-\d{2}$/);
  if (!match) throw new WatchdogError(`Invalid Karnataka DPAL ${label} date: ${value}`, "shape_drift");
  return Number(match[1]);
}
