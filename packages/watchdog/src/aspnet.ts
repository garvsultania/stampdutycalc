import { createHash } from "node:crypto";
import { WatchdogError } from "./errors.js";
import { absolutize, attributes, decodeHtml, stripTags } from "./html.js";
import type { GazetteRow, RequestSpec } from "./types.js";

export interface AspNetTablePage {
  rows: GazetteRow[];
  pageNumber: number;
  pagesExpected: number;
  nextPostBack?: { eventTarget: string; eventArgument: string };
  hiddenFields: Record<string, string>;
  formAction: string;
}

export function parseAspNetDocumentTable(
  html: string,
  responseUrl: string,
  pageNumber: number,
  baseFormValues: Record<string, string> = {},
): AspNetTablePage {
  const form = firstForm(html);
  const hidden = hiddenFields(form.inner);
  if (!hidden.__VIEWSTATE) throw new WatchdogError("Required ASP.NET hidden field __VIEWSTATE is missing", "shape_drift");
  const formAction = absolutize(responseUrl, form.attrs.action ?? responseUrl);
  const rows: GazetteRow[] = [];
  for (const row of form.inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const inner = row[1]!;
    const cells = [...inner.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripTags(cell[1]!));
    const target = documentTarget(inner, responseUrl);
    if (cells.length < 2 || !target) continue;
    const title = cells.filter(Boolean).join(" | ");
    const gazetteDate = cells.find((cell) => /\b(?:\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\b/.test(cell));
    const formValues = target.formValues ? { ...baseFormValues, ...hidden, ...target.formValues } : undefined;
    const pdfRequest: RequestSpec = formValues
      ? { url: target.url, method: "POST", formValues }
      : { url: target.url };
    rows.push({
      sourceRowId: createHash("sha256").update(JSON.stringify({ cells, request: pdfRequest })).digest("hex"),
      cells,
      title,
      ...(gazetteDate ? { gazetteDate } : {}),
      pdfTarget: target.url,
      pdfRequest,
      retrieval: { form_values: formValues ?? {} },
    });
  }
  if (rows.length === 0) throw new WatchdogError("ASP.NET result table contained no document rows", "shape_drift");

  const pagers = [...decodeHtml(form.inner).matchAll(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]Page\$(\d+)['"]\s*\)/gi)]
    .map((match) => ({ eventTarget: match[1]!, eventArgument: `Page$${match[2]!}`, page: Number(match[2]) }))
    .filter((entry) => Number.isSafeInteger(entry.page) && entry.page > 0);
  const pagesExpected = pagers.length > 0 ? Math.max(pageNumber, ...pagers.map((entry) => entry.page)) : pageNumber;
  const next = pagers.find((entry) => entry.page === pageNumber + 1);
  if (pageNumber < pagesExpected && !next) {
    throw new WatchdogError(`Pagination advertises ${pagesExpected} pages but page ${pageNumber + 1} is unreachable`, "shape_drift");
  }
  return {
    rows,
    pageNumber,
    pagesExpected,
    ...(next ? { nextPostBack: { eventTarget: next.eventTarget, eventArgument: next.eventArgument } } : {}),
    hiddenFields: hidden,
    formAction,
  };
}

function firstForm(html: string): { attrs: Record<string, string>; inner: string } {
  const match = html.match(/(<form\b[^>]*>)([\s\S]*?)<\/form>/i);
  if (!match) throw new WatchdogError("Expected ASP.NET form was not present", "shape_drift");
  return { attrs: attributes(match[1]!), inner: match[2]! };
}

function hiddenFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const input of html.matchAll(/<input\b[^>]*>/gi)) {
    const attrs = attributes(input[0]);
    if (attrs.type?.toLowerCase() === "hidden" && attrs.name) out[attrs.name] = attrs.value ?? "";
  }
  return out;
}

function documentTarget(inner: string, responseUrl: string): { url: string; formValues?: Record<string, string> } | undefined {
  for (const link of inner.matchAll(/<a\b[^>]*>/gi)) {
    const attrs = attributes(link[0]);
    const candidate = attrs.href ?? attrs.onclick;
    if (!candidate) continue;
    const postback = candidate.match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/i);
    if (postback && !/^Page\$/i.test(postback[2]!)) {
      return { url: responseUrl, formValues: { __EVENTTARGET: postback[1]!, __EVENTARGUMENT: postback[2]! } };
    }
    const urlValue = candidate.match(/(?:window\.open\s*\(\s*)?['"]([^'"]+)['"]/i)?.[1] ?? candidate;
    if (/javascript:|__doPostBack/i.test(urlValue)) continue;
    if (/\.pdf(?:$|[?#])|ViewPdf|download|gazette/i.test(urlValue)) return { url: absolutize(responseUrl, urlValue) };
  }
  return undefined;
}
