import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DocumentRecord, SweepRun } from "./types.js";

const data = (path: string) => fileURLToPath(new URL(`../../../watchdog-data/sources/mh-egazette-part4b/${path}`, import.meta.url));

describe("Maharashtra Part IV-B direct evidence", () => {
  it("records complete acquisition, independent re-fetch, and stable-identity audits", async () => {
    const sweeps = await jsonLines<SweepRun>(data("state/sweeps.jsonl"));
    const complete = sweeps.filter((sweep) =>
      sweep.source_id === "mh-egazette-part4b" &&
      sweep.range_from === "2021-07-17" &&
      sweep.range_to === "2026-07-19" &&
      sweep.status === "ok"
    );

    expect(complete).toHaveLength(3);
    expect(complete.at(-1)).toMatchObject({
      source_id: "mh-egazette-part4b",
      range_from: "2021-07-17",
      range_to: "2026-07-19",
      status: "ok",
      rows_seen: 2575,
      pages_expected: 26,
      pages_fetched: 26,
    });

    const documents = await jsonLines<DocumentRecord>(data("index/documents.jsonl"));
    expect(documents).toHaveLength(2575);
    expect(new Set(documents.map((document) => document.source_row_id))).toHaveLength(2575);
    expect(new Set(documents.map((document) => document.sha256))).toHaveLength(2547);
    expect(documents.some((document) => "__VIEWSTATE" in (document.retrieval.form_values ?? {}))).toBe(false);
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
