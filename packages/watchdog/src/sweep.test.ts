import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EvidenceStore } from "./archive.js";
import { WatchdogError } from "./errors.js";
import { runMhEgazetteSweep, SweepFailedError } from "./sweep.js";
import type { Fetcher, RequestSpec, ResponseRecord } from "./types.js";

const sourceUrl = "https://example.test/GazetteSearch.aspx";
const initialHtml = `
<form action="GazetteSearch.aspx">
  <input type="hidden" name="__VIEWSTATE" value="initial-state">
  <select name="division"><option value="1">CENTRAL SECTION</option></select>
  <select name="section"><option value="15">Part 8 (English)</option></select>
  <select name="type"><option value="1">Extra-Ordinary</option></select>
  <input name="fromDate" type="text">
  <input name="toDate" type="text">
  <input name="searchButton" type="submit" value="Search">
</form>`;
const resultHtml = `
<form action="GazetteSearch.aspx">
  <input type="hidden" name="__VIEWSTATE" value="result-state">
  <table>
    <tr>
      <td>2026/07/13</td><td>MAHARASHTRA ACT No. XXIX OF 2026</td>
      <td><a href="javascript:__doPostBack('document-1','')">View</a></td>
    </tr>
    <tr>
      <td>2026/04/07</td><td>MAHARASHTRA ACT No. XVI OF 2026</td>
      <td><a href="javascript:__doPostBack('document-2','')">View</a></td>
    </tr>
  </table>
</form>`;

class FixtureFetcher implements Fetcher {
  documentRequests = 0;

  constructor(private readonly failDocument = false) {}

  async request(spec: RequestSpec): Promise<ResponseRecord> {
    if (!spec.method) return response(spec, "text/html", initialHtml);
    if (/^document-[12]$/.test(spec.formValues?.__EVENTTARGET ?? "")) {
      this.documentRequests++;
      if (this.failDocument && this.documentRequests === 2) {
        throw new WatchdogError("network interrupted", "source_unreachable");
      }
      return response(spec, "application/pdf", `%PDF-1.7\nfixture-${spec.formValues?.__EVENTTARGET}`);
    }
    return response(spec, "text/html", resultHtml);
  }
}

describe("MH e-Gazette sweep", () => {
  it("records a complete run and re-runs without adding blobs or documents", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-sweep-"));
    const evidence = new EvidenceStore(root);
    const fetcher = new FixtureFetcher();
    let run = 0;
    let tick = 0;
    const dependencies = {
      fetcher,
      evidence,
      runId: () => `run-${++run}`,
      now: () => `2026-07-17T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    };

    const first = await runMhEgazetteSweep({ from: "2026-07-13", to: "2026-07-13" }, dependencies);
    const second = await runMhEgazetteSweep({ from: "2026-07-13", to: "2026-07-13" }, dependencies);

    expect(first).toMatchObject({ status: "ok", rows: 2, documentsFetched: 2, newBlobs: 2 });
    expect(first.newDocuments).toHaveLength(2);
    expect(second).toMatchObject({ status: "ok", rows: 2, documentsFetched: 2, newBlobs: 0 });
    expect(second.newDocuments).toHaveLength(0);
    expect(await jsonLines(join(root, "index", "documents.jsonl"))).toHaveLength(2);
    expect(await jsonLines(join(root, "state", "sweeps.jsonl"))).toHaveLength(2);
    expect(await jsonLines(join(root, "state", "events.jsonl"))).toHaveLength(1);
  });

  it("records a bounded run as partial and emits an event", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-sweep-"));
    const evidence = new EvidenceStore(root);
    const fetcher = new FixtureFetcher();

    const report = await runMhEgazetteSweep(
      { from: "2026-07-13", to: "2026-07-13", limit: 1 },
      { fetcher, evidence, runId: () => "partial-run", now: () => "2026-07-17T00:00:00.000Z" },
    );

    expect(report).toMatchObject({ status: "partial", rows: 2, documentsFetched: 1, newBlobs: 1 });
    const sweeps = await jsonLines(join(root, "state", "sweeps.jsonl"));
    const events = await jsonLines(join(root, "state", "events.jsonl"));
    expect(sweeps[0]).toMatchObject({ status: "partial", rows_seen: 2 });
    expect(events.map((event) => event.type)).toEqual(["new_document", "sweep_partial"]);
    expect(events[1]).toMatchObject({ type: "sweep_partial", run_id: "partial-run" });
  });

  it("records a mid-sweep network failure as partial, never as a clean zero", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-sweep-"));
    const evidence = new EvidenceStore(root);

    await expect(runMhEgazetteSweep(
      { from: "2026-07-13", to: "2026-07-13" },
      {
        fetcher: new FixtureFetcher(true),
        evidence,
        runId: () => "failed-run",
        now: () => "2026-07-17T00:00:00.000Z",
      },
    )).rejects.toMatchObject<SweepFailedError>({ report: { status: "partial", rows: 2, documentsFetched: 1 } });

    const sweeps = await jsonLines(join(root, "state", "sweeps.jsonl"));
    const events = await jsonLines(join(root, "state", "events.jsonl"));
    expect(sweeps[0]).toMatchObject({ status: "partial", rows_seen: 2, error: "network interrupted" });
    expect(events[0]).toMatchObject({ type: "sweep_partial", run_id: "failed-run" });
  });

  it("records initial shape drift as a failed sweep with a shape-drift event", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-sweep-"));
    const evidence = new EvidenceStore(root);
    const fetcher: Fetcher = {
      request: async (spec) => response(spec, "text/html", "<html>changed</html>"),
    };

    await expect(runMhEgazetteSweep(
      { from: "2026-07-13", to: "2026-07-13" },
      { fetcher, evidence, runId: () => "shape-run", now: () => "2026-07-17T00:00:00.000Z" },
    )).rejects.toMatchObject<SweepFailedError>({ report: { status: "failed", rows: 0 } });

    const sweeps = await jsonLines(join(root, "state", "sweeps.jsonl"));
    const events = await jsonLines(join(root, "state", "events.jsonl"));
    expect(sweeps[0]).toMatchObject({ status: "failed", rows_seen: 0 });
    expect(events[0]).toMatchObject({ type: "shape_drift", run_id: "shape-run" });
  });
});

function response(spec: RequestSpec, mediaType: string, body: string): ResponseRecord {
  return {
    url: sourceUrl,
    status: 200,
    mediaType,
    body: new TextEncoder().encode(body),
    headers: { "content-type": mediaType },
    request: { method: spec.method ?? "GET", url: spec.url, ...(spec.formValues ? { formValues: spec.formValues } : {}) },
  };
}

async function jsonLines(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
