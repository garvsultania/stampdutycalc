import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEvent, EvidenceStore } from "./archive.js";
import { WatchdogError } from "./errors.js";
import type { GazetteRow } from "./types.js";

const row: GazetteRow = {
  sourceRowId: "row-1",
  cells: ["1", "Part 8", "2026/07/13", "Act XXIX"],
  title: "Part 8 | 2026/07/13 | Act XXIX",
  gazetteDate: "2026/07/13",
  pdfTarget: "https://example.test/GazetteSearch.aspx",
  pdfRequest: {
    url: "https://example.test/GazetteSearch.aspx",
    method: "POST",
    formValues: { __EVENTTARGET: "document-1", __EVENTARGUMENT: "" },
  },
  retrieval: { form_values: { __EVENTTARGET: "document-1", __EVENTARGUMENT: "" } },
};

describe("watchdog evidence store", () => {
  it("archives immutable content once and deduplicates index and events", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-watchdog-"));
    const store = new EvidenceStore(root);
    const body = new TextEncoder().encode("%PDF-1.4\ntest");

    const first = await store.archive(row, body, "application/pdf", "2026-07-17T00:00:00.000Z");
    const second = await store.archive(row, body, "application/pdf", "2026-07-17T00:01:00.000Z");
    expect(first).toMatchObject({ newBlob: true, newDocument: true });
    expect(second).toMatchObject({ newBlob: false, newDocument: false });

    const event = createEvent("run-1", "new_document", "one document", [first.document.sha256]);
    expect(await store.emitEvent(event)).toBe(true);
    expect(await store.emitEvent({ ...event, run_id: "run-2" })).toBe(false);
    const failureOne = createEvent("run-1", "source_unreachable", "HTTP 500");
    const failureTwo = createEvent("run-2", "source_unreachable", "HTTP 500");
    expect(await store.emitEvent(failureOne)).toBe(true);
    expect(await store.emitEvent(failureTwo)).toBe(true);

    expect(await store.refreshDocumentMetadata([{ ...row, gazetteDate: "2026/07/14" }])).toBe(1);
    expect(await store.refreshDocumentMetadata([{ ...row, gazetteDate: "2026/07/14" }])).toBe(0);

    const index = (await readFile(join(root, "index", "documents.jsonl"), "utf8")).trim().split("\n");
    const events = (await readFile(join(root, "state", "events.jsonl"), "utf8")).trim().split("\n");
    expect(index).toHaveLength(1);
    expect(JSON.parse(index[0]!).gazette_date).toBe("2026/07/14");
    expect(events).toHaveLength(3);
  });

  it("refuses to target the rules corpus", () => {
    expect(() => new EvidenceStore("/tmp/project/rules/watchdog")).toThrowError(WatchdogError);
  });

  it("indexes document occurrences by source row even when content is shared", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-watchdog-"));
    const store = new EvidenceStore(root);
    const body = new TextEncoder().encode("%PDF-1.4\nshared");

    const first = await store.archive(row, body, "application/pdf", "2026-07-17T00:00:00.000Z");
    const second = await store.archive(
      { ...row, sourceRowId: "row-2", title: "A second official occurrence" },
      body,
      "application/pdf",
      "2026-07-17T00:01:00.000Z",
    );

    expect(first).toMatchObject({ newBlob: true, newDocument: true });
    expect(second).toMatchObject({ newBlob: false, newDocument: true });
    expect((await readFile(join(root, "index", "documents.jsonl"), "utf8")).trim().split("\n")).toHaveLength(2);
  });

  it("verifies resumed blobs and rejects changed content for the same official row", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-watchdog-"));
    const store = new EvidenceStore(root);
    const body = new TextEncoder().encode("%PDF-1.4\noriginal");
    const archived = await store.archive(row, body, "application/pdf", "2026-07-17T00:00:00.000Z");

    await expect(store.archivedDocument(row)).resolves.toMatchObject({ sha256: archived.document.sha256 });
    await expect(
      store.archive(
        row,
        new TextEncoder().encode("%PDF-1.4\nchanged"),
        "application/pdf",
        "2026-07-17T00:01:00.000Z",
      ),
    ).rejects.toThrow(/changed content/);
  });
});
