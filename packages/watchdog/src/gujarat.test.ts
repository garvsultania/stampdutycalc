import { describe, expect, it } from "vitest";
import { WatchdogError } from "./errors.js";
import { parseGujaratRecentGazettes } from "./gujarat.js";

const url = "https://egazette.gujarat.gov.in/RecentGazette.aspx";
const fixture = `
<form action="RecentGazette.aspx">
  <input type="hidden" name="__VIEWSTATE" value="state">
  <table>
    <tr><td>1</td><td>16/07/2026</td><td>29</td><td>Part IV-B</td><td><a href="ViewPdf2.aspx?docid=ordinary.pdf&amp;cdbid=one&amp;contentType=application/pdf">Download</a></td></tr>
    <tr><td>1</td><td>16/07/2026</td><td>5454</td><td>Part-II Extra</td><td><a href="ViewPdf2.aspx?docid=extra.pdf&amp;cdbid=two&amp;contentType=application/pdf">Download</a></td></tr>
  </table>
  <a href="javascript:__doPostBack('ctl00$ContentPlaceHolder1$gvExtraGazette','Page$2')">2</a>
</form>`;

describe("Gujarat official e-Gazette", () => {
  it("separates ordinary and extraordinary first-party rows", () => {
    const page = parseGujaratRecentGazettes(fixture, url);

    expect(page.ordinary).toHaveLength(1);
    expect(page.extraordinary).toHaveLength(1);
    expect(page.ordinary[0]?.pdfRequest.url).toContain("egazette.gujarat.gov.in/ViewPdf2.aspx");
    expect(page.extraordinary[0]?.title).toContain("Part-II Extra");
  });

  it("fails loudly if one publication table disappears", () => {
    expect(() => parseGujaratRecentGazettes(fixture.replace("Part-II Extra", "Part II"), url)).toThrowError(WatchdogError);
  });
});
