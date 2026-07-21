import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeSource } from "./probe.js";
import type { Fetcher, RequestSpec, ResponseRecord } from "./types.js";

const gujarat = `
<form><input type="hidden" name="__VIEWSTATE" value="state"><table>
<tr><td>16/07/2026</td><td>29</td><td>Part IV-B</td><td><a href="ViewPdf2.aspx?docid=o.pdf&amp;cdbid=one&amp;contentType=application/pdf">Download</a></td></tr>
<tr><td>16/07/2026</td><td>5454</td><td>Part-II Extra</td><td><a href="ViewPdf2.aspx?docid=e.pdf&amp;cdbid=two&amp;contentType=application/pdf">Download</a></td></tr>
</table></form>`;

describe("bounded official-source probes", () => {
  it("records source shape without claiming sweep completeness", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-probe-"));
    const output = join(root, "probe.jsonl");
    const fetcher: Fetcher = { request: async () => response("https://egazette.gujarat.gov.in/RecentGazette.aspx", gujarat) };

    const report = await probeSource(fetcher, "gj-egazette", output);

    expect(report).toMatchObject({ status: "probe_ok", documents: 2 });
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(report);
    expect(JSON.stringify(report)).not.toContain('"status":"ok"');
  });

  it("discovers IGR Maharashtra publication families without treating them as documents", async () => {
    const fetcher: Fetcher = { request: async () => response(
      "https://igrmaharashtra.gov.in/Marathi/publication",
      `<a href="/Marathi/acts">कायदे</a><a href="/Marathi/valuation_rates">मूल्यांकन दर</a>`,
    ) };

    await expect(probeSource(fetcher, "mh-igr-publications")).resolves.toMatchObject({
      status: "probe_ok",
      documents: 0,
      pages: 2,
      detail: expect.stringMatching(/documents not acquired/i),
    });
  });

  it("traverses every Karnataka annual page and enforces the amendment checklist", async () => {
    const requested: string[] = [];
    const required: Record<number, number[]> = {
      2021: [26],
      2022: [11, 12, 31],
      2023: [3],
      2024: [4, 23],
      2025: [30, 42],
      2026: [1],
    };
    const fetcher: Fetcher = {
      request: async (spec: RequestSpec) => {
        requested.push(spec.url);
        const year = Number(spec.url.match(/\/(20\d{2})\/en$/)?.[1]);
        const links = (required[year] ?? []).map((act) =>
          `<a href="/uploads/media_to_upload${year}${act}.pdf">KARNATAKA ACT NO. ${act} OF ${year}</a>`
        ).join("");
        return response(spec.url, links);
      },
    };

    await expect(probeSource(fetcher, "ka-dpal-acts")).resolves.toMatchObject({
      status: "probe_ok",
      documents: 10,
      pages: 6,
      detail: expect.stringMatching(/all 9 required amendment Acts identified; PDFs not acquired/i),
    });
    expect(requested).toEqual([
      "https://dpal.karnataka.gov.in/79/2021/en",
      "https://dpal.karnataka.gov.in/79/2022/en",
      "https://dpal.karnataka.gov.in/79/2023/en",
      "https://dpal.karnataka.gov.in/79/2024/en",
      "https://dpal.karnataka.gov.in/79/2025/en",
      "https://dpal.karnataka.gov.in/79/2026/en",
    ]);
  });

  it("traverses all Delhi listing pages without downloading discovered PDFs", async () => {
    const requested: string[] = [];
    const fetcher: Fetcher = {
      request: async (spec: RequestSpec) => {
        requested.push(spec.url);
        if (spec.url.endsWith("?page=1")) {
          return response(spec.url, '<a href="/sites/default/files/revenue/second.pdf">Second</a><a href="?page=0">Previous</a>');
        }
        return response(spec.url, '<a href="/sites/default/files/revenue/first.pdf">First</a><a href="?page=1">Next</a>');
      },
    };

    await expect(probeSource(fetcher, "dl-revenue-notifications")).resolves.toMatchObject({
      status: "probe_ok",
      documents: 2,
      pages: 2,
      detail: expect.stringMatching(/PDFs not acquired/i),
    });
    expect(requested).toEqual([
      "https://revenue.delhi.gov.in/revenue/notification",
      "https://revenue.delhi.gov.in/revenue/notification?page=1",
    ]);
  });

});

function response(url: string, body: string): ResponseRecord {
  return {
    url,
    status: 200,
    mediaType: "text/html",
    body: new TextEncoder().encode(body),
    headers: {},
    request: { method: "GET", url },
  };
}
