import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DocumentRecord, SweepRun } from "./types.js";

const data = (path: string) => fileURLToPath(new URL(`../../../watchdog-data/sources/mh-egazette-part4b/${path}`, import.meta.url));

describe("Maharashtra Part IV-B direct evidence", () => {
  it("records five-year discovery completeness without mislabelling the bounded probe as complete", async () => {
    const sweeps = await jsonLines<SweepRun>(data("state/sweeps.jsonl"));
    expect(sweeps).toContainEqual(expect.objectContaining({
      source_id: "mh-egazette-part4b",
      range_from: "2021-07-17",
      range_to: "2026-07-17",
      status: "partial",
      rows_seen: 2573,
      pages_expected: 26,
      pages_fetched: 26,
      error: "Bounded sweep fetched 1 of 2573 listed documents",
    }));
  });

  it("archives the known commencement notification from the official e-Gazette", async () => {
    const documents = await jsonLines<DocumentRecord>(data("index/documents.jsonl"));
    const sentinel = documents.find((document) => /Mudrank-2024\/C\.R\.\s*182\/Mudrank-2/i.test(document.title));

    expect(sentinel).toMatchObject({
      source_id: "mh-egazette-part4b",
      gazette_date: "2026/01/09",
      media_type: "application/pdf",
      sha256: "1d2695a0be9714d2cc94e9218e9ce4fdff28a12e0968fae0dda9aad4e835d07f",
    });
    expect(sentinel?.retrieval.url).toBe("https://egazzete.mahaonline.gov.in/Forms/GazetteSearch.aspx");
    expect(sentinel?.retrieval.form_values?.__EVENTTARGET).toBeTruthy();
  });
});

async function jsonLines<T>(path: string): Promise<T[]> {
  return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}
