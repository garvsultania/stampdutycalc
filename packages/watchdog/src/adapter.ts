import type { Fetcher, GazettePage, GazetteRow, SourceId } from "./types.js";

export interface SweepRange {
  from: string;
  to: string;
}

export interface DiscoveryPage {
  rows: GazetteRow[];
  pageNumber: number;
  pagesExpected?: number;
}

export interface DiscoverySession {
  firstPage: DiscoveryPage;
  next(current: DiscoveryPage): Promise<DiscoveryPage | undefined>;
}

export interface SourceAdapter {
  readonly sourceId: SourceId;
  begin(fetcher: Fetcher, range: SweepRange): Promise<DiscoverySession>;
  verifyDocument(mediaType: string, body: Uint8Array, description: string): void;
}

export function aspNetSession(
  firstPage: GazettePage,
  next: (current: GazettePage) => Promise<GazettePage | undefined>,
): DiscoverySession {
  return {
    firstPage,
    next: (current) => next(current as GazettePage),
  };
}
