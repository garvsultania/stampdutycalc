import { describe, expect, it } from "vitest";
import { parseAspNetDocumentTable } from "./aspnet.js";
import { WatchdogError } from "./errors.js";

const url = "https://egazette.gujarat.gov.in/RecentGazette.aspx";

const page = `
<form action="RecentGazette.aspx">
  <input type="hidden" name="__VIEWSTATE" value="state">
  <table>
    <tr><th>Date</th><th>Issue</th><th>Download</th></tr>
    <tr><td>16/07/2026</td><td>Extra 5454</td><td><a href="ViewPdf2.aspx?docid=one.pdf&amp;cdbid=abc&amp;contentType=application/pdf">Download</a></td></tr>
  </table>
  <a href="javascript:__doPostBack('gazetteGrid','Page$2')">2</a>
</form>`;

describe("generic ASP.NET document tables", () => {
  it("parses direct government PDF handlers and postback pagination", () => {
    const result = parseAspNetDocumentTable(page, url, 1);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ gazetteDate: "16/07/2026" });
    expect(result.rows[0]?.pdfRequest.url).toBe(
      "https://egazette.gujarat.gov.in/ViewPdf2.aspx?docid=one.pdf&cdbid=abc&contentType=application/pdf",
    );
    expect(result.nextPostBack).toEqual({ eventTarget: "gazetteGrid", eventArgument: "Page$2" });
  });

  it("fails loudly when ASP.NET state or document rows disappear", () => {
    expect(() => parseAspNetDocumentTable(page.replace('name="__VIEWSTATE"', 'name="missing"'), url, 1)).toThrowError(WatchdogError);
    expect(() => parseAspNetDocumentTable('<form><input type="hidden" name="__VIEWSTATE" value="state"></form>', url, 1)).toThrowError(WatchdogError);
  });
});
