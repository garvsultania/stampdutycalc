import { WatchdogError } from "./errors.js";
import { parseStaticDocumentIndex } from "./static-index.js";
import type { GazetteRow } from "./types.js";

export interface KarnatakaActGroup {
  actNumber: number;
  year: number;
  rows: GazetteRow[];
}

export function parseKarnatakaActPage(html: string, responseUrl: string): KarnatakaActGroup[] {
  const rows = parseStaticDocumentIndex(html, responseUrl, {
    linkPattern: /(?:storage\/pdf-files|uploads\/media_to_upload).*\.pdf(?:$|[?#])/i,
  });
  const groups = new Map<string, KarnatakaActGroup>();
  for (const row of rows) {
    const match = row.title.match(/(?:ACT\s+NO\.?\s*|Gazette\s*[—:-]?\s*|^)(\d{1,2})\s+(?:OF|of)\s+(20\d{2})/i)
      ?? row.pdfRequest.url.match(/(?:^|\/)(\d{1,2})of(20\d{2})/i);
    if (!match) continue;
    const actNumber = Number(match[1]);
    const year = Number(match[2]);
    const key = `${year}-${actNumber}`;
    const group = groups.get(key) ?? { actNumber, year, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  if (groups.size === 0) throw new WatchdogError("Karnataka DPAL page contained no identifiable Acts", "shape_drift");
  return [...groups.values()].sort((a, b) => a.year - b.year || a.actNumber - b.actNumber);
}

export function requireKarnatakaActs(groups: KarnatakaActGroup[], expected: Array<{ actNumber: number; year: number }>): void {
  const actual = new Set(groups.map((group) => `${group.year}-${group.actNumber}`));
  const missing = expected.filter((act) => !actual.has(`${act.year}-${act.actNumber}`));
  if (missing.length > 0) {
    throw new WatchdogError(
      `Karnataka DPAL is missing expected Acts: ${missing.map((act) => `${act.actNumber}/${act.year}`).join(", ")}`,
      "shape_drift",
    );
  }
}
