import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EvidenceStore } from "./archive.js";
import { karnatakaActsAdapter } from "./karnataka-adapter.js";
import { runSweep, SweepFailedError } from "./sweep.js";
import type { Fetcher, RequestSpec, ResponseRecord } from "./types.js";

const required: Record<number, number[]> = {
  2021: [26],
  2022: [11, 12, 31],
  2023: [3],
  2024: [4, 23],
  2025: [30, 42],
  2026: [1],
};

class KarnatakaAcquisitionFixtures implements Fetcher {
  listingRequests = 0;
  documentRequests = 0;

  async request(spec: RequestSpec): Promise<ResponseRecord> {
    const year = Number(spec.url.match(/\/(20\d{2})\/en$/)?.[1]);
    if (year) {
      this.listingRequests++;
      const links = (required[year] ?? []).map((act) =>
        `<a href="/uploads/media_to_upload/${act}of${year}.pdf">KARNATAKA ACT NO. ${act} OF ${year}</a>`
      ).join("");
      return response(spec.url, "text/html", links);
    }
    this.documentRequests++;
    return response(spec.url, "application/pdf", `%PDF-1.7\n${spec.url}`);
  }
}

describe("Karnataka DPAL acquisition adapter", () => {
  it("archives every discovered PDF after the six-page checklist passes", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-ka-sweep-"));
    const fetcher = new KarnatakaAcquisitionFixtures();
    const report = await runSweep(
      karnatakaActsAdapter(),
      { from: "2021-01-01", to: "2026-07-21" },
      {
        fetcher,
        evidence: new EvidenceStore(root, "ka-dpal-acts"),
        runId: () => "ka-run",
        now: () => "2026-07-21T12:00:00.000Z",
      },
    );

    expect(report).toMatchObject({
      status: "ok",
      rows: 10,
      pagesFetched: 6,
      pagesExpected: 6,
      documentsFetched: 10,
      newBlobs: 10,
    });
    expect(fetcher).toMatchObject({ listingRequests: 6, documentRequests: 10 });
    expect(await jsonLines(join(root, "index", "documents.jsonl"))).toHaveLength(10);
  });

  it("fails before discovery when the requested years do not cover the controlled annual range", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-ka-sweep-"));
    const fetcher = new KarnatakaAcquisitionFixtures();

    await expect(runSweep(
      karnatakaActsAdapter(),
      { from: "2022-01-01", to: "2026-07-21" },
      {
        fetcher,
        evidence: new EvidenceStore(root, "ka-dpal-acts"),
        runId: () => "ka-range-failure",
        now: () => "2026-07-21T12:00:00.000Z",
      },
    )).rejects.toMatchObject<SweepFailedError>({
      report: { status: "failed", rows: 0, error: expect.stringMatching(/2021 through 2026/) },
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
