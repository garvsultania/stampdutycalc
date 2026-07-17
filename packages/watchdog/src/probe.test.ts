import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeSource } from "./probe.js";
import type { Fetcher, ResponseRecord } from "./types.js";

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
