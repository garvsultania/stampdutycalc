import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inspectSearchForm, MH_PART4B_SELECTION, parseResultsPage, requirePdf } from "./egazette.js";
import { mhPart4bAdapter, stabilizeMhGazetteRows } from "./mh-adapter.js";
import { WatchdogError } from "./errors.js";
import type { ResponseRecord } from "./types.js";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const recording = root("../../../watchdog-data/recordings/full-acceptance-20260717/bodies/");
const responseUrl = "https://egazzete.mahaonline.gov.in/Forms/GazetteSearch.aspx";
const searchFormValues = {
  "ctl00$CPH$ddldivision": "1",
  "ctl00$CPH$ddlSection": "15",
  "ctl00$CPH$ddlGazetteType": "1",
  "ctl00$CPH$txtfromDate": "09/04/2025",
  "ctl00$CPH$txtToDate": "16/07/2026",
  "ctl00$CPH$btnSearch": "Search",
};

describe("Maharashtra e-Gazette result fixtures", () => {
  it("discovers the exact Part 8 English Extra-Ordinary search controls", async () => {
    const html = await readFile(`${recording}0001.html`, "utf8");
    const form = inspectSearchForm(html, responseUrl, { from: "2025-04-09", to: "2026-07-16" });

    expect(form.action).toBe(responseUrl);
    expect(form.values).toMatchObject(searchFormValues);
    expect(form.values.__VIEWSTATE).toBeTruthy();
  });

  it("selects Part IV-B without changing the reusable ASP.NET form parser", async () => {
    const html = await readFile(`${recording}0001.html`, "utf8");
    const form = inspectSearchForm(
      html,
      responseUrl,
      { from: "2021-07-17", to: "2026-07-17" },
      MH_PART4B_SELECTION,
    );

    expect(form.values["ctl00$CPH$ddlSection"]).toBe("9");
    expect(form.values["ctl00$CPH$ddldivision"]).toBe("1");
    expect(form.values["ctl00$CPH$ddlGazetteType"]).toBe("1");
    expect(mhPart4bAdapter().sourceId).toBe("mh-egazette-part4b");
  });

  it("parses all 195 rows and the HTML-entity-encoded second-page postback", async () => {
    const firstHtml = await readFile(`${recording}0002.html`, "utf8");
    const secondHtml = await readFile(`${recording}0003.html`, "utf8");
    const first = parseResultsPage(firstHtml, responseUrl, 1, searchFormValues);
    const second = parseResultsPage(secondHtml, responseUrl, 2, searchFormValues);
    const rows = [...first.rows, ...second.rows];

    expect(first.rows).toHaveLength(100);
    expect(second.rows).toHaveLength(95);
    expect(rows).toHaveLength(195);
    expect(new Set(rows.map((row) => row.sourceRowId))).toHaveLength(195);
    expect(rows[0]?.gazetteDate).toBe("2026/07/13");
    expect(first.nextPostBack).toEqual({ eventTarget: "ctl00$CPH$GridView2", eventArgument: "Page$2" });
    expect(second.nextPostBack).toBeUndefined();
    for (const act of ["LXIII OF 2025", "XIII OF 2026", "XVI OF 2026", "XXIX OF 2026"]) {
      expect(rows.some((row) => new RegExp(`MAHARASHTRA ACT No\\. ${act}`, "i").test(row.title))).toBe(true);
    }
  });

  it("fails loudly on missing form state, explicit zero rows, and unreachable advertised pagination", async () => {
    const initialHtml = await readFile(`${recording}0001.html`, "utf8");
    expect(() => inspectSearchForm(initialHtml.replace(/name="__VIEWSTATE"/i, 'name="missing"'), responseUrl, {
      from: "2025-04-09",
      to: "2026-07-16",
    })).toThrowError(WatchdogError);

    expect(() => parseResultsPage(
      '<form><input type="hidden" name="__VIEWSTATE" value="state">No record found</form>',
      responseUrl,
      1,
      searchFormValues,
    )).toThrowError(WatchdogError);

    const firstHtml = await readFile(`${recording}0002.html`, "utf8");
    const unreachable = firstHtml.replace(/Page\$2/gi, "Page$3");
    expect(() => parseResultsPage(unreachable, responseUrl, 1, searchFormValues)).toThrowError(WatchdogError);
  });

  it("uses page hidden state and removes the search submit control from document postbacks", async () => {
    const firstHtml = await readFile(`${recording}0002.html`, "utf8");
    const first = parseResultsPage(firstHtml, responseUrl, 1, searchFormValues);
    const request = first.rows[0]!.pdfRequest;

    expect(request.method).toBe("POST");
    expect(request.formValues?.__VIEWSTATE).toBe(first.hiddenFields.__VIEWSTATE);
    expect(request.formValues?.__EVENTTARGET).toBe("ctl00$CPH$GridView2$ctl02$LinkButton1");
    expect(request.formValues?.["ctl00$CPH$btnSearch"]).toBeUndefined();
  });

  it("gives Part IV-B rows stable identities when portal positions change", () => {
    const first = fixtureRow("1", "ctl00$CPH$GridView2$ctl02$LinkButton1", "First subject");
    const second = fixtureRow("2", "ctl00$CPH$GridView2$ctl03$LinkButton1", "Second subject");
    const reorderedFirst = fixtureRow("4", "ctl00$CPH$GridView2$ctl05$LinkButton1", "First subject");
    const reorderedSecond = fixtureRow("1", "ctl00$CPH$GridView2$ctl02$LinkButton1", "Second subject");

    stabilizeMhGazetteRows([first, second]);
    stabilizeMhGazetteRows([reorderedSecond, reorderedFirst]);

    expect(reorderedFirst.sourceRowId).toBe(first.sourceRowId);
    expect(reorderedSecond.sourceRowId).toBe(second.sourceRowId);
  });

  it("fails loudly when a document postback returns HTML with status 200", () => {
    const response = makeResponse("text/html", new TextEncoder().encode("<html>results</html>"));
    expect(() => requirePdf(response, "test document")).toThrowError(WatchdogError);
  });

  it("accepts only a PDF media type with a PDF signature", () => {
    const response = makeResponse("application/pdf", new TextEncoder().encode("%PDF-1.7\n"));
    expect(() => requirePdf(response, "test document")).not.toThrow();
  });
});

function fixtureRow(serial: string, eventTarget: string, subject: string) {
  return {
    sourceRowId: eventTarget,
    cells: [serial, "CENTRAL SECTION", "Part -4 B", "2026/07/16", subject, "View"],
    title: `${serial} | CENTRAL SECTION | Part -4 B | 2026/07/16 | ${subject} | View`,
    gazetteDate: "2026/07/16",
    pdfTarget: responseUrl,
    pdfRequest: { url: responseUrl, method: "POST" as const, formValues: { __EVENTTARGET: eventTarget } },
    retrieval: { form_values: { __EVENTTARGET: eventTarget } },
  };
}

function makeResponse(mediaType: string, body: Uint8Array): ResponseRecord {
  return {
    url: responseUrl,
    status: 200,
    mediaType,
    body,
    headers: {},
    request: { method: "POST", url: responseUrl },
  };
}
