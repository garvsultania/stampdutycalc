import { createHash } from "node:crypto";
import { WatchdogError } from "./errors.js";
import { absolutize, attributes, stripTags } from "./html.js";
import type { GazetteRow } from "./types.js";

export interface StaticIndexOptions {
  linkPattern?: RegExp;
  datePattern?: RegExp;
}

export function parseStaticDocumentIndex(
  html: string,
  responseUrl: string,
  options: StaticIndexOptions = {},
): GazetteRow[] {
  const linkPattern = options.linkPattern ?? /\.pdf(?:$|[?#])/i;
  const datePattern = options.datePattern ?? /\b(?:\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/;
  const rows: GazetteRow[] = [];

  for (const link of html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/gi)) {
    const attrs = attributes(link[1]!);
    if (!attrs.href || !linkPattern.test(attrs.href)) continue;
    const url = absolutize(responseUrl, attrs.href.replace(/\\/g, "/"));
    const title = stripTags(link[2]!) || stripTags(attrs.title ?? "") || url;
    const contextStart = Math.max(0, (link.index ?? 0) - 300);
    const contextEnd = Math.min(html.length, (link.index ?? 0) + link[0].length + 300);
    const context = stripTags(html.slice(contextStart, contextEnd));
    const gazetteDate = context.match(datePattern)?.[0];
    const request = { url } as const;
    rows.push({
      sourceRowId: createHash("sha256").update(JSON.stringify({ title, request })).digest("hex"),
      cells: [title, ...(gazetteDate ? [gazetteDate] : [])],
      title,
      ...(gazetteDate ? { gazetteDate } : {}),
      pdfTarget: url,
      pdfRequest: request,
      retrieval: { form_values: {} },
    });
  }
  if (rows.length === 0) throw new WatchdogError("Static government index contained no document links", "shape_drift");
  const unique = new Map(rows.map((row) => [row.sourceRowId, row]));
  return [...unique.values()];
}

export function parseStaticPageLinks(html: string, responseUrl: string, pattern: RegExp): string[] {
  const urls = new Set<string>();
  for (const link of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attributes(link[0]).href;
    if (href && pattern.test(href)) urls.add(absolutize(responseUrl, href.replace(/\\/g, "/")));
  }
  if (urls.size === 0) throw new WatchdogError("Static government index contained no matching page links", "shape_drift");
  return [...urls];
}
