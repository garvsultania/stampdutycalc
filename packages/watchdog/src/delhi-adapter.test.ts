import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EvidenceStore } from "./archive.js";
import { delhiRevenueNotificationsAdapter } from "./delhi-adapter.js";
import { runSweep, SweepFailedError } from "./sweep.js";
import type { Fetcher, RequestSpec, ResponseRecord } from "./types.js";

class DelhiAcquisitionFixtures implements Fetcher {
  listingRequests = 0;
  documentRequests = 0;

  async request(spec: RequestSpec): Promise<ResponseRecord> {
    if (spec.url.endsWith(".pdf")) {
      this.documentRequests++;
      return response(spec.url, "application/pdf", `%PDF-1.7\n${spec.url}`);
    }
    this.listingRequests++;
    if (spec.url.endsWith("?page=1")) {
      return response(spec.url, "text/html", `
        <a href="/sites/default/files/revenue/second.pdf">Second notification</a>
        <a href="?page=0">Previous</a>`);
    }
    return response(spec.url, "text/html", `
      <a href="/sites/default/files/revenue/first.pdf">First notification</a>
      <a href="?page=1">Next</a>`);
  }
}

describe("Delhi Revenue snapshot acquisition adapter", () => {
  it("archives every unique PDF from the bounded listing traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-dl-sweep-"));
    const fetcher = new DelhiAcquisitionFixtures();
    const report = await runSweep(
      delhiRevenueNotificationsAdapter(),
      { from: "2026-07-21", to: "2026-07-21" },
      {
        fetcher,
        evidence: new EvidenceStore(root, "dl-revenue-notifications"),
        runId: () => "dl-run",
        now: () => "2026-07-21T12:00:00.000Z",
      },
    );

    expect(report).toMatchObject({
      status: "ok",
      rows: 2,
      pagesFetched: 2,
      pagesExpected: 2,
      documentsFetched: 2,
      newBlobs: 2,
    });
    expect(fetcher).toMatchObject({ listingRequests: 2, documentRequests: 2 });
    expect(await jsonLines(join(root, "index", "documents.jsonl"))).toHaveLength(2);
  });

  it("refuses a date interval that could misstate static-listing coverage", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-dl-sweep-"));
    const fetcher = new DelhiAcquisitionFixtures();

    await expect(runSweep(
      delhiRevenueNotificationsAdapter(),
      { from: "2021-01-01", to: "2026-07-21" },
      {
        fetcher,
        evidence: new EvidenceStore(root, "dl-revenue-notifications"),
        runId: () => "dl-range-failure",
        now: () => "2026-07-21T12:00:00.000Z",
      },
    )).rejects.toMatchObject<SweepFailedError>({
      report: { status: "failed", rows: 0, error: expect.stringMatching(/identical YYYY-MM-DD observation dates/) },
    });
    expect(fetcher).toMatchObject({ listingRequests: 0, documentRequests: 0 });
  });
});

function response(url: string, mediaType: string, body: string): ResponseRecord {
  return {
    url,
    status: 200,
    mediaType,
    body: new TextEncoder().encode(body),
    headers: { "content-type": mediaType },
    request: { method: "GET", url },
  };
}

async function jsonLines(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
