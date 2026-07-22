import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  backupBlobCollection,
  generateBlobManifest,
  restoreBlobCollection,
  verifyBlobCollection,
  writeBlobManifest,
  type BlobCollection,
  type DurableBlobStore,
} from "./integrity.js";

describe("Watchdog blob integrity and restore", () => {
  it("generates a deterministic manifest and verifies every local body", async () => {
    const fixture = await makeCollection();
    const first = await generateBlobManifest(fixture.collection);
    const second = await generateBlobManifest(fixture.collection);
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      schema_version: 1,
      source_id: "test-source",
      document_occurrences: 3,
      unique_blobs: 2,
    });
    expect(first.blobs.map((blob) => blob.sha256)).toEqual([...fixture.blobs.keys()].sort());

    await writeBlobManifest(fixture.collection.manifestPath, first);
    await expect(verifyBlobCollection(fixture.collection, { requireBodies: true })).resolves.toMatchObject({
      status: "verified",
      document_occurrences: 3,
      unique_blobs: 2,
      verified_blobs: 2,
    });
  });

  it("reports a fresh clone as unavailable but rejects partial or corrupt local bodies", async () => {
    const fixture = await makeCollection();
    const manifest = await generateBlobManifest(fixture.collection);
    await writeBlobManifest(fixture.collection.manifestPath, manifest);

    const fresh = await cloneMetadata(fixture.collection, "fresh");
    await expect(verifyBlobCollection(fresh)).resolves.toMatchObject({ status: "unavailable", verified_blobs: 0 });
    await expect(verifyBlobCollection(fresh, { requireBodies: true })).rejects.toThrow(/unavailable/);

    const partial = await cloneMetadata(fixture.collection, "partial");
    const [firstHash, firstBody] = [...fixture.blobs.entries()][0]!;
    await writeBlob(partial.blobRoot, firstHash, firstBody);
    await expect(verifyBlobCollection(partial)).rejects.toThrow(/partial or contains unindexed files/);

    const corrupt = await cloneMetadata(fixture.collection, "corrupt");
    for (const [hash, body] of fixture.blobs) await writeBlob(corrupt.blobRoot, hash, body);
    const lastHash = [...fixture.blobs.keys()].at(-1)!;
    await writeFile(blobPath(corrupt.blobRoot, lastHash), new TextEncoder().encode("wrong"));
    await expect(verifyBlobCollection(corrupt)).rejects.toThrow(/size mismatch|hash mismatch/);
  });

  it("backs up and restores through a provider-neutral store, then verifies the restore", async () => {
    const fixture = await makeCollection();
    const manifest = await generateBlobManifest(fixture.collection);
    await writeBlobManifest(fixture.collection.manifestPath, manifest);
    const store = new MemoryStore();

    await expect(backupBlobCollection(fixture.collection, store)).resolves.toEqual({
      provider: "memory-test",
      uploaded: 2,
    });
    const destination = join(fixture.root, "restored", "blobs");
    await expect(restoreBlobCollection(fixture.collection.manifestPath, destination, store)).resolves.toMatchObject({
      status: "verified",
      verified_blobs: 2,
    });
  });
});

class MemoryStore implements DurableBlobStore {
  readonly id = "memory-test";
  private readonly bodies = new Map<string, Uint8Array>();

  async upload(objectKey: string, sourcePath: string): Promise<void> {
    this.bodies.set(objectKey, await readFile(sourcePath));
  }

  async download(objectKey: string, destinationPath: string): Promise<boolean> {
    const body = this.bodies.get(objectKey);
    if (!body) return false;
    await writeFile(destinationPath, body, { flag: "wx" });
    return true;
  }
}

async function makeCollection(): Promise<{
  root: string;
  collection: BlobCollection;
  blobs: Map<string, Uint8Array>;
}> {
  const root = await mkdtemp(join(tmpdir(), "stampdraft-integrity-"));
  const collection: BlobCollection = {
    sourceId: "test-source",
    indexPath: join(root, "index", "documents.jsonl"),
    blobRoot: join(root, "blobs"),
    manifestPath: join(root, "state", "blob-manifest.json"),
  };
  const bodies = [new TextEncoder().encode("%PDF-1.7\nfirst"), new TextEncoder().encode("%PDF-1.7\nsecond")];
  const blobs = new Map(bodies.map((body) => [createHash("sha256").update(body).digest("hex"), body]));
  const hashes = [...blobs.keys()];
  const documents = [hashes[0]!, hashes[1]!, hashes[0]!].map((sha256, index) => ({
    sha256,
    source_id: "test-source",
    source_row_id: `row-${index + 1}`,
    title: `Document ${index + 1}`,
    fetched_at: "2026-07-21T00:00:00.000Z",
    retrieval: { url: "https://example.gov.in/document.pdf" },
    media_type: "application/pdf",
    ocr: null,
  }));
  await mkdir(join(root, "index"), { recursive: true });
  await writeFile(collection.indexPath, `${documents.map((document) => JSON.stringify(document)).join("\n")}\n`);
  for (const [hash, body] of blobs) await writeBlob(collection.blobRoot, hash, body);
  return { root, collection, blobs };
}

async function cloneMetadata(collection: BlobCollection, name: string): Promise<BlobCollection> {
  const root = join(join(collection.indexPath, "..", ".."), name);
  const clone = {
    sourceId: collection.sourceId,
    indexPath: join(root, "index", "documents.jsonl"),
    blobRoot: join(root, "blobs"),
    manifestPath: join(root, "state", "blob-manifest.json"),
  };
  await mkdir(join(root, "index"), { recursive: true });
  await mkdir(join(root, "state"), { recursive: true });
  await writeFile(clone.indexPath, await readFile(collection.indexPath));
  await writeFile(clone.manifestPath, await readFile(collection.manifestPath));
  return clone;
}

async function writeBlob(root: string, sha256: string, body: Uint8Array): Promise<void> {
  const path = blobPath(root, sha256);
  await mkdir(join(root, sha256.slice(0, 2)), { recursive: true });
  await writeFile(path, body);
}

function blobPath(root: string, sha256: string): string {
  return join(root, sha256.slice(0, 2), `${sha256}.pdf`);
}
