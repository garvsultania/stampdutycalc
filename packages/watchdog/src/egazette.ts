import { createHash } from "node:crypto";
import { WatchdogError } from "./errors.js";
import { absolutize, attributes, decodeHtml, htmlText, stripTags } from "./html.js";
import type { Fetcher, GazettePage, GazetteRow, RequestSpec, ResponseRecord } from "./types.js";

export const EGAZETTE_URL = "https://egazzete.mahaonline.gov.in/Forms/GazetteSearch.aspx";

const EXPECTED = {
  division: { value: "1", label: /central\s+section/i },
  section: { value: "15", label: /part\s*8\s*\(english\)/i },
  type: { value: "1", label: /extra[-\s]*ordinary/i },
};

export interface GazetteSearch {
  from: string;
  to: string;
}

export interface SearchSession {
  firstPage: GazettePage;
  searchFormValues: Record<string, string>;
  response: ResponseRecord;
}

export async function beginSearch(fetcher: Fetcher, range: GazetteSearch): Promise<SearchSession> {
  const initial = await fetcher.request({ url: EGAZETTE_URL });
  requireHtml(initial, "initial e-Gazette form");
  const html = htmlText(initial.body);
  const form = inspectSearchForm(html, initial.url, range);
  const response = await fetcher.request({ url: form.action, method: "POST", formValues: form.values });
  requireHtml(response, "e-Gazette search results");
  const firstPage = parseResultsPage(htmlText(response.body), response.url, 1, form.values);
  return { firstPage, searchFormValues: form.values, response };
}

export async function fetchNextPage(
  fetcher: Fetcher,
  current: GazettePage,
  searchFormValues: Record<string, string>,
): Promise<{ page: GazettePage; response: ResponseRecord }> {
  if (!current.nextPostBack) throw new WatchdogError("Pagination requested without a next-page control", "shape_drift");
  const values = {
    ...searchFormValues,
    ...current.hiddenFields,
    __EVENTTARGET: current.nextPostBack.eventTarget,
    __EVENTARGUMENT: current.nextPostBack.eventArgument,
  };
  deleteSubmitControls(values);
  const response = await fetcher.request({ url: current.formAction, method: "POST", formValues: values });
  requireHtml(response, `e-Gazette results page ${current.pageNumber + 1}`);
  const page = parseResultsPage(htmlText(response.body), response.url, current.pageNumber + 1, searchFormValues);
  return { page, response };
}

export function inspectSearchForm(
  html: string,
  responseUrl: string,
  range: GazetteSearch,
): { action: string; values: Record<string, string> } {
  const form = firstForm(html);
  const hidden = hiddenFields(form.inner);
  requireHidden(hidden, "__VIEWSTATE");

  const selects = parseSelects(form.inner);
  const division = findExpectedSelect(selects, EXPECTED.division, "CENTRAL SECTION(1)");
  const section = findExpectedSelect(selects, EXPECTED.section, "Part 8 (English)(15)");
  const type = findExpectedSelect(selects, EXPECTED.type, "Extra-Ordinary(1)");
  const dateInputs = findDateInputs(form.inner);
  const submit = findSearchSubmit(form.inner);

  return {
    action: absolutize(responseUrl, form.attrs.action ?? responseUrl),
    values: {
      ...hidden,
      [division.name]: division.value,
      [section.name]: section.value,
      [type.name]: type.value,
      [dateInputs.from]: toGovernmentDate(range.from),
      [dateInputs.to]: toGovernmentDate(range.to),
      [submit.name]: submit.value,
    },
  };
}

export function requirePdf(response: ResponseRecord, description: string): void {
  const hasPdfSignature =
    response.body.byteLength >= 5 &&
    response.body[0] === 0x25 &&
    response.body[1] === 0x50 &&
    response.body[2] === 0x44 &&
    response.body[3] === 0x46 &&
    response.body[4] === 0x2d;
  if (!response.mediaType.includes("pdf") || !hasPdfSignature) {
    throw new WatchdogError(
      `${description} returned ${response.mediaType} without a PDF signature`,
      "shape_drift",
    );
  }
}

export function parseResultsPage(
  html: string,
  responseUrl: string,
  pageNumber: number,
  searchFormValues: Record<string, string>,
): GazettePage {
  if (/no\s+record|no\s+data|record\s+not\s+found/i.test(stripTags(html))) {
    throw new WatchdogError("e-Gazette returned an explicit zero-row result for a known non-empty range", "shape_drift");
  }

  const form = firstForm(html);
  const hidden = hiddenFields(form.inner);
  requireHidden(hidden, "__VIEWSTATE");
  const action = absolutize(responseUrl, form.attrs.action ?? responseUrl);
  const pageFormValues = { ...searchFormValues, ...hidden };
  deleteSubmitControls(pageFormValues);
  const rows = parseDocumentRows(form.inner, responseUrl, pageFormValues);
  if (rows.length === 0) throw new WatchdogError("e-Gazette result table contained no document rows", "shape_drift");

  const decodedForm = decodeHtml(form.inner);
  const pagers = [...decodedForm.matchAll(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]Page\$(\d+)['"]\s*\)/gi)]
    .map((match) => ({ eventTarget: match[1]!, eventArgument: `Page$${match[2]!}`, page: Number(match[2]) }))
    .filter((entry) => Number.isSafeInteger(entry.page) && entry.page > 0);
  const pagesExpected = pagers.length > 0 ? Math.max(pageNumber, ...pagers.map((pager) => pager.page)) : pageNumber;
  const next = pagers.find((pager) => pager.page === pageNumber + 1);
  if (pageNumber < pagesExpected && !next) {
    throw new WatchdogError(`Pagination advertises ${pagesExpected} pages but page ${pageNumber + 1} is unreachable`, "shape_drift");
  }

  return {
    rows,
    pageNumber,
    pagesExpected,
    ...(next ? { nextPostBack: { eventTarget: next.eventTarget, eventArgument: next.eventArgument } } : {}),
    hiddenFields: hidden,
    formAction: action,
  };
}

function parseDocumentRows(html: string, responseUrl: string, searchFormValues: Record<string, string>): GazetteRow[] {
  const rows: GazetteRow[] = [];
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const inner = rowMatch[1]!;
    const cells = [...inner.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripTags(cell[1]!));
    if (cells.length < 2) continue;
    const target = documentTarget(inner, responseUrl);
    if (!target) continue;
    const title = cells.filter(Boolean).join(" | ");
    const gazetteDate = cells.find((cell) =>
      /\b(?:\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\b/.test(cell),
    );
    const sourceRowId = createHash("sha256").update(JSON.stringify({ cells, target: target.url, form: target.formValues })).digest("hex");
    rows.push({
      sourceRowId,
      cells,
      title,
      ...(gazetteDate ? { gazetteDate } : {}),
      pdfTarget: target.url,
      pdfRequest: target.formValues
        ? { url: target.url, method: "POST", formValues: { ...searchFormValues, ...target.formValues } }
        : { url: target.url },
      retrieval: { form_values: { ...searchFormValues, ...(target.formValues ?? {}) } },
    });
  }
  return rows;
}

function documentTarget(inner: string, responseUrl: string): { url: string; formValues?: Record<string, string> } | undefined {
  for (const link of inner.matchAll(/<a\b[^>]*>/gi)) {
    const attrs = attributes(link[0]);
    const candidate = attrs.href ?? attrs.onclick;
    if (!candidate) continue;
    const postback = candidate.match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/i);
    if (postback) {
      if (/^Page\$/i.test(postback[2]!)) continue;
      return { url: responseUrl, formValues: { __EVENTTARGET: postback[1]!, __EVENTARGUMENT: postback[2]! } };
    }
    const urlValue = candidate.match(/(?:window\.open\s*\(\s*)?['"]([^'"]+)['"]/i)?.[1] ?? candidate;
    if (/javascript:|__doPostBack/i.test(urlValue)) continue;
    if (/\.pdf(?:$|[?#])|gazette|download|view/i.test(urlValue)) return { url: absolutize(responseUrl, urlValue) };
  }
  return undefined;
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
    if (attrs.type?.toLowerCase() !== "hidden" || !attrs.name) continue;
    out[attrs.name] = attrs.value ?? "";
  }
  return out;
}

function parseSelects(html: string): Array<{ name: string; options: Array<{ value: string; text: string }> }> {
  const out: Array<{ name: string; options: Array<{ value: string; text: string }> }> = [];
  for (const select of html.matchAll(/(<select\b[^>]*>)([\s\S]*?)<\/select>/gi)) {
    const attrs = attributes(select[1]!);
    if (!attrs.name) continue;
    const options = [...select[2]!.matchAll(/(<option\b[^>]*>)([\s\S]*?)<\/option>/gi)].map((option) => ({
      value: attributes(option[1]!).value ?? "",
      text: stripTags(option[2]!),
    }));
    out.push({ name: attrs.name, options });
  }
  return out;
}

function findExpectedSelect(
  selects: ReturnType<typeof parseSelects>,
  expected: { value: string; label: RegExp },
  description: string,
): { name: string; value: string } {
  const matches = selects.filter((select) => select.options.some((option) => option.value === expected.value && expected.label.test(option.text)));
  if (matches.length !== 1) {
    throw new WatchdogError(`Expected exactly one select containing ${description}; found ${matches.length}`, "shape_drift");
  }
  return { name: matches[0]!.name, value: expected.value };
}

function findDateInputs(html: string): { from: string; to: string } {
  const names = [...html.matchAll(/<input\b[^>]*>/gi)]
    .map((input) => attributes(input[0]))
    .filter((attrs) => attrs.name && (!attrs.type || /text|date/i.test(attrs.type)))
    .map((attrs) => attrs.name!);
  const from = names.find((name) => /from/i.test(name));
  const to = names.find((name) => /to/i.test(name));
  if (!from || !to || from === to) throw new WatchdogError("Could not uniquely identify from/to date fields", "shape_drift");
  return { from, to };
}

function findSearchSubmit(html: string): { name: string; value: string } {
  const controls = [...html.matchAll(/<(?:input|button)\b[^>]*>/gi)].map((input) => attributes(input[0]));
  const matches = controls.filter((attrs) => attrs.name && /search|show|submit/i.test(`${attrs.value ?? ""} ${attrs.id ?? ""} ${attrs.name}`));
  if (matches.length === 0) throw new WatchdogError("Could not identify the e-Gazette search submit control", "shape_drift");
  const control = matches[0]!;
  return { name: control.name!, value: control.value ?? "Search" };
}

function requireHidden(fields: Record<string, string>, name: string): void {
  if (!(name in fields) || !fields[name]) throw new WatchdogError(`Required ASP.NET hidden field ${name} is missing`, "shape_drift");
}

function requireHtml(response: ResponseRecord, description: string): void {
  if (!response.mediaType.includes("html")) {
    throw new WatchdogError(`${description} returned ${response.mediaType}, expected HTML`, "shape_drift");
  }
}

function toGovernmentDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new WatchdogError(`Invalid ISO date ${iso}`, "shape_drift");
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function deleteSubmitControls(values: Record<string, string>): void {
  for (const key of Object.keys(values)) {
    if (/btn|button|search|submit/i.test(key) && !key.startsWith("__")) delete values[key];
  }
}
