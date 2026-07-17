import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DocumentRecord, RecordedResponseMeta, SweepRun, WatchdogEvent } from "./types.js";

const data = (path: string) => fileURLToPath(new URL(`../../../watchdog-data/${path}`, import.meta.url));
const acceptanceActs = [
  /MAHARASHTRA ACT No\. LXIII OF 2025/i,
  /MAHARASHTRA ACT No\. XIII OF 2026/i,
  /MAHARASHTRA ACT No\. XVI OF 2026/i,
  /MAHARASHTRA ACT No\. XXIX OF 2026/i,
];

describe("committed MH e-Gazette evidence", () => {
  it("indexes 195 unique, reproducible PDF records including every acceptance Act", async () => {
    const documents = await jsonLines<DocumentRecord>(data("index/documents.jsonl"));

    expect(documents).toHaveLength(195);
    expect(new Set(documents.map((document) => document.sha256))).toHaveLength(195);
    expect(new Set(documents.map((document) => document.source_row_id))).toHaveLength(195);
    for (const document of documents) {
      expect(document).toMatchObject({
        source_id: "mh-egazette",
        media_type: "application/pdf",
        ocr: null,
      });
      expect(document.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(document.gazette_date).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
      expect(document.retrieval.url).toBe("https://egazzete.mahaonline.gov.in/Forms/GazetteSearch.aspx");
      expect(document.retrieval.form_values?.__EVENTTARGET).toBeTruthy();
    }
    for (const act of acceptanceActs) {
      expect(documents.filter((document) => act.test(document.title))).toHaveLength(1);
    }
  });

  it("links the successful two-page sweep to the complete new-document event", async () => {
    const documents = await jsonLines<DocumentRecord>(data("index/documents.jsonl"));
    const sweeps = await jsonLines<SweepRun>(data("state/sweeps.jsonl"));
    const events = await jsonLines<WatchdogEvent>(data("state/events.jsonl"));
    const successful = sweeps.find((sweep) => sweep.status === "ok");

    expect(successful).toMatchObject({
      source_id: "mh-egazette",
      range_from: "2025-04-09",
      range_to: "2026-07-16",
      rows_seen: 195,
      pages_expected: 2,
      pages_fetched: 2,
    });
    const event = events.find((candidate) => candidate.type === "new_document" && candidate.run_id === successful?.run_id);
    expect(event?.documents).toHaveLength(195);
    expect(new Set(event?.documents)).toEqual(new Set(documents.map((document) => document.sha256)));
    expect(events.some((candidate) => candidate.type === "sweep_partial")).toBe(true);
  });

  it("keeps a complete, sanitized sidecar sequence for the canonical live recording", async () => {
    const root = data("recordings/full-acceptance-20260717");
    const names = (await readdir(root)).filter((name) => /^\d{4}\.json$/.test(name)).sort();
    const metadata = await Promise.all(names.map(async (name) => JSON.parse(await readFile(`${root}/${name}`, "utf8")) as RecordedResponseMeta));

    expect(names).toHaveLength(198);
    expect(metadata.map((entry) => entry.sequence)).toEqual(Array.from({ length: 198 }, (_, index) => index + 1));
    expect(metadata.filter((entry) => entry.response.media_type === "text/html")).toHaveLength(3);
    expect(metadata.filter((entry) => entry.response.media_type === "application/pdf")).toHaveLength(195);
    for (const entry of metadata) {
      const names = Object.keys(entry.response.headers).map((name) => name.toLowerCase());
      expect(names).not.toContain("set-cookie");
      expect(names).not.toContain("cookie");
      expect(names).not.toContain("authorization");
      expect(entry.response.status).toBe(200);
    }
  });
});

async function jsonLines<T>(path: string): Promise<T[]> {
  return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}
