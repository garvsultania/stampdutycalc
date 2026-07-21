import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEvidenceCatalog } from "./catalog.js";

describe("Watchdog evidence catalog", () => {
  it("loads nested document/sweep/event shards and ignores probe records", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-catalog-"));
    const source = join(root, "sources", "test-source");
    await mkdir(join(source, "index"), { recursive: true });
    await mkdir(join(source, "state"), { recursive: true });
    const sha256 = "b".repeat(64);
    const indexBody =
      `${JSON.stringify({
        sha256,
        source_id: "test-source",
        source_row_id: "row-1",
        title: "Official document",
        gazette_date: "2026/07/19",
        fetched_at: "2026-07-19T00:00:00.000Z",
        retrieval: { url: "https://example.gov.in/document.pdf" },
        media_type: "application/pdf",
        ocr: null,
      })}\n`;
    await writeFile(
      join(source, "index", "documents.jsonl"),
      indexBody,
    );
    await writeFile(
      join(source, "state", "sweeps.jsonl"),
      `${JSON.stringify({
        run_id: "run-1",
        source_id: "test-source",
        range_from: "2026-07-19",
        range_to: "2026-07-19",
        started_at: "2026-07-19T00:00:00.000Z",
        finished_at: "2026-07-19T00:01:00.000Z",
        status: "ok",
        rows_seen: 1,
      })}\n`,
    );
    await writeFile(
      join(source, "state", "events.jsonl"),
      `${JSON.stringify({
        event_id: "event-1",
        type: "new_document",
        source_id: "test-source",
        run_id: "run-1",
        documents: [sha256],
        detail: "one document",
      })}\n`,
    );
    await writeFile(
      join(source, "state", "occurrence-history.jsonl"),
      `${JSON.stringify({
        history_id: "a".repeat(64),
        source_id: "test-source",
        source_row_id: "row-1",
        run_id: "run-1",
        observed_at: "2026-07-19T00:01:00.000Z",
        sha256,
        transient_form_state_removed: false,
        before: { title: "Old title", gazette_date: null, retrieval: { url: "https://example.gov.in/document.pdf" } },
        after: { title: "Official document", gazette_date: "2026/07/19", retrieval: { url: "https://example.gov.in/document.pdf" } },
      })}\n`,
    );
    await writeFile(join(source, "state", "probe.jsonl"), `${JSON.stringify({ status: "probe_ok" })}\n`);
    await writeFile(
      join(source, "state", "identity-migrations.jsonl"),
      `${JSON.stringify({
        migration_id: "d".repeat(64),
        source_id: "test-source",
        baseline_run_id: "run-1",
        strategy: "stable-visible-row-v1",
        before_occurrences: 2,
        after_occurrences: 1,
        transient_form_state_removed: true,
        pre_migration_index_sha256: null,
        post_migration_index_sha256: createHash("sha256").update(indexBody).digest("hex"),
        backup_retained: false,
        audit_note: "Synthetic migration fixture.",
        migrated_at: "2026-07-19T00:02:00.000Z",
      })}\n`,
    );

    const catalog = loadEvidenceCatalog(root);
    expect(catalog.documents).toHaveLength(1);
    expect(catalog.sweeps).toHaveLength(1);
    expect(catalog.events).toHaveLength(1);
    expect(catalog.identityMigrations).toHaveLength(1);
    expect(catalog.occurrenceHistory).toHaveLength(1);
    expect(catalog.sources.find((candidate) => candidate.id === "mh-egazette-part8")).toMatchObject({
      status: "provisional",
      evidence_ids: ["mh-egazette"],
    });
    expect(catalog.promotions.find((candidate) => candidate.source_id === "mh-egazette-part8")).toMatchObject({
      eligible: false,
    });
  });

  it("rejects a same-size migrated index whose durable digest no longer matches", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-catalog-migration-"));
    const source = join(root, "sources", "test-source");
    await mkdir(join(source, "index"), { recursive: true });
    await mkdir(join(source, "state"), { recursive: true });
    await writeFile(
      join(source, "index", "documents.jsonl"),
      `${JSON.stringify({
        sha256: "e".repeat(64),
        source_id: "test-source",
        source_row_id: "row-1",
        title: "Changed index",
        fetched_at: "2026-07-19T00:00:00.000Z",
      })}\n`,
    );
    await writeFile(
      join(source, "state", "identity-migrations.jsonl"),
      `${JSON.stringify({
        migration_id: "f".repeat(64),
        source_id: "test-source",
        baseline_run_id: "run-1",
        strategy: "stable-visible-row-v1",
        before_occurrences: 2,
        after_occurrences: 1,
        transient_form_state_removed: true,
        pre_migration_index_sha256: null,
        post_migration_index_sha256: "0".repeat(64),
        backup_retained: false,
        migrated_at: "2026-07-19T00:02:00.000Z",
      })}\n`,
    );

    expect(() => loadEvidenceCatalog(root)).toThrow(/post-migration index digest does not match/);
  });

  it("rejects a duplicate source-row occurrence across shards", async () => {
    const root = await mkdtemp(join(tmpdir(), "stampdraft-catalog-duplicate-"));
    const sha256 = "c".repeat(64);
    for (const sourceName of ["one", "two"]) {
      const dir = join(root, "sources", sourceName, "index");
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "documents.jsonl"),
        `${JSON.stringify({
          sha256,
          source_id: "same-source",
          source_row_id: "same-row",
          title: "duplicate",
          fetched_at: "2026-07-19T00:00:00.000Z",
          retrieval: { url: "https://example.gov.in/document.pdf" },
          media_type: "application/pdf",
          ocr: null,
        })}\n`,
      );
    }
    expect(() => loadEvidenceCatalog(root)).toThrow(/Duplicate document source occurrence/);
  });
});
