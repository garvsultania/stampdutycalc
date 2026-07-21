import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { WatchdogError } from "./errors.js";
import type { DocumentRecord } from "./types.js";

export interface BlobCollection {
  sourceId: string;
  indexPath: string;
  blobRoot: string;
  manifestPath: string;
}

export interface BlobManifest {
  schema_version: 1;
  source_id: string;
  index_sha256: string;
  document_occurrences: number;
  unique_blobs: number;
  blobs: Array<{ sha256: string; bytes: number }>;
}

export interface BlobVerificationReport {
  source_id: string;
  status: "verified" | "unavailable";
  document_occurrences: number;
  unique_blobs: number;
  verified_blobs: number;
  verified_bytes: number;
}

export interface DurableBlobStore {
  readonly id: string;
  upload(objectKey: string, sourcePath: string): Promise<void>;
  download(objectKey: string, destinationPath: string): Promise<boolean>;
}

export const WATCHDOG_BLOB_COLLECTIONS: readonly BlobCollection[] = [
  {
    sourceId: "mh-egazette-part8",
    indexPath: "watchdog-data/index/documents.jsonl",
    blobRoot: "watchdog-data/blobs",
    manifestPath: "watchdog-data/state/blob-manifest.json",
  },
  {
    sourceId: "mh-egazette-part4b",
    indexPath: "watchdog-data/sources/mh-egazette-part4b/index/documents.jsonl",
    blobRoot: "watchdog-data/sources/mh-egazette-part4b/blobs",
    manifestPath: "watchdog-data/sources/mh-egazette-part4b/state/blob-manifest.json",
  },
];

export async function generateBlobManifest(collection: BlobCollection): Promise<BlobManifest> {
  const indexBody = await readFile(collection.indexPath);
  const documents = parseDocuments(indexBody.toString("utf8"), collection.indexPath);
  const hashes = [...new Set(documents.map((document) => document.sha256))].sort();
  const blobs: BlobManifest["blobs"] = [];
  for (const sha256 of hashes) {
    const path = blobPath(collection.blobRoot, sha256);
    const info = await stat(path);
    if (!info.isFile()) throw new WatchdogError(`Manifest blob is not a file: ${path}`, "shape_drift");
    const actual = await sha256File(path);
    if (actual !== sha256) {
      throw new WatchdogError(`Manifest blob hash mismatch at ${path}: expected ${sha256}, got ${actual}`, "shape_drift");
    }
    blobs.push({ sha256, bytes: info.size });
  }
  return {
    schema_version: 1,
    source_id: collection.sourceId,
    index_sha256: createHash("sha256").update(indexBody).digest("hex"),
    document_occurrences: documents.length,
    unique_blobs: blobs.length,
    blobs,
  };
}

export async function writeBlobManifest(path: string, manifest: BlobManifest): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, renderBlobManifest(manifest), { flag: "wx" });
  await rename(temporary, target);
}

export function renderBlobManifest(manifest: BlobManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function verifyBlobCollection(
  collection: BlobCollection,
  options: { requireBodies?: boolean } = {},
): Promise<BlobVerificationReport> {
  const manifest = parseManifest(await readFile(collection.manifestPath, "utf8"), collection.manifestPath);
  if (manifest.source_id !== collection.sourceId) {
    throw new WatchdogError(
      `Blob manifest source ${manifest.source_id} does not match ${collection.sourceId}`,
      "shape_drift",
    );
  }
  const indexBody = await readFile(collection.indexPath);
  const indexDigest = createHash("sha256").update(indexBody).digest("hex");
  if (manifest.index_sha256 !== indexDigest) {
    throw new WatchdogError(`Blob manifest is stale for ${collection.indexPath}`, "shape_drift");
  }
  const documents = parseDocuments(indexBody.toString("utf8"), collection.indexPath);
  const indexHashes = [...new Set(documents.map((document) => document.sha256))].sort();
  const manifestHashes = manifest.blobs.map((blob) => blob.sha256);
  if (
    manifest.document_occurrences !== documents.length ||
    manifest.unique_blobs !== manifest.blobs.length ||
    JSON.stringify(manifestHashes) !== JSON.stringify(indexHashes)
  ) {
    throw new WatchdogError(`Blob manifest counts or hashes do not match ${collection.indexPath}`, "shape_drift");
  }
  if (new Set(manifestHashes).size !== manifestHashes.length) {
    throw new WatchdogError(`Blob manifest contains duplicate hashes: ${collection.manifestPath}`, "shape_drift");
  }
  if (manifest.blobs.some((blob) => !Number.isSafeInteger(blob.bytes) || blob.bytes < 1)) {
    throw new WatchdogError(`Blob manifest contains an invalid byte length: ${collection.manifestPath}`, "shape_drift");
  }
  return verifyManifestBodies(manifest, collection.blobRoot, options.requireBodies ?? false);
}

export async function backupBlobCollection(
  collection: BlobCollection,
  store: DurableBlobStore,
): Promise<{ provider: string; uploaded: number }> {
  const manifest = parseManifest(await readFile(collection.manifestPath, "utf8"), collection.manifestPath);
  await verifyBlobCollection(collection, { requireBodies: true });
  for (const blob of manifest.blobs) {
    await store.upload(objectKey(manifest.source_id, blob.sha256), blobPath(collection.blobRoot, blob.sha256));
  }
  return { provider: store.id, uploaded: manifest.blobs.length };
}

export async function restoreBlobCollection(
  manifestPath: string,
  destinationRoot: string,
  store: DurableBlobStore,
): Promise<BlobVerificationReport> {
  const root = safeDestination(destinationRoot);
  const manifest = parseManifest(await readFile(manifestPath, "utf8"), manifestPath);
  for (const blob of manifest.blobs) {
    const destination = blobPath(root, blob.sha256);
    await mkdir(dirname(destination), { recursive: true });
    if (!await store.download(objectKey(manifest.source_id, blob.sha256), destination)) {
      throw new WatchdogError(`Durable provider ${store.id} is missing ${blob.sha256}`, "shape_drift");
    }
  }
  return verifyManifestBodies(manifest, root, true);
}

async function verifyManifestBodies(
  manifest: BlobManifest,
  blobRoot: string,
  requireBodies: boolean,
): Promise<BlobVerificationReport> {
  const actualFiles = await blobFiles(blobRoot);
  if (actualFiles.length === 0) {
    if (requireBodies) {
      throw new WatchdogError(`Blob bodies are unavailable for ${manifest.source_id}`, "shape_drift");
    }
    return {
      source_id: manifest.source_id,
      status: "unavailable",
      document_occurrences: manifest.document_occurrences,
      unique_blobs: manifest.unique_blobs,
      verified_blobs: 0,
      verified_bytes: 0,
    };
  }
  const expectedPaths = manifest.blobs.map((blob) => resolve(blobPath(blobRoot, blob.sha256))).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedPaths)) {
    throw new WatchdogError(
      `Blob set for ${manifest.source_id} is partial or contains unindexed files (${actualFiles.length}/${expectedPaths.length})`,
      "shape_drift",
    );
  }
  let verifiedBytes = 0;
  for (const blob of manifest.blobs) {
    const path = blobPath(blobRoot, blob.sha256);
    const info = await stat(path);
    if (info.size !== blob.bytes) {
      throw new WatchdogError(`Blob size mismatch at ${path}: expected ${blob.bytes}, got ${info.size}`, "shape_drift");
    }
    const actual = await sha256File(path);
    if (actual !== blob.sha256) {
      throw new WatchdogError(`Blob hash mismatch at ${path}: expected ${blob.sha256}, got ${actual}`, "shape_drift");
    }
    verifiedBytes += info.size;
  }
  return {
    source_id: manifest.source_id,
    status: "verified",
    document_occurrences: manifest.document_occurrences,
    unique_blobs: manifest.unique_blobs,
    verified_blobs: manifest.blobs.length,
    verified_bytes: verifiedBytes,
  };
}

function parseDocuments(body: string, path: string): DocumentRecord[] {
  return body.split("\n").filter(Boolean).map((line, index) => {
    const value = JSON.parse(line) as Partial<DocumentRecord>;
    if (
      typeof value.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.sha256) ||
      typeof value.source_id !== "string" ||
      typeof value.source_row_id !== "string"
    ) {
      throw new WatchdogError(`Invalid document index record in ${path}:${index + 1}`, "shape_drift");
    }
    return value as DocumentRecord;
  });
}

function parseManifest(body: string, path: string): BlobManifest {
  const value = JSON.parse(body) as Partial<BlobManifest>;
  if (
    value.schema_version !== 1 ||
    typeof value.source_id !== "string" ||
    typeof value.index_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.index_sha256) ||
    !Number.isSafeInteger(value.document_occurrences) ||
    !Number.isSafeInteger(value.unique_blobs) ||
    !Array.isArray(value.blobs) ||
    value.blobs.some((blob) =>
      typeof blob !== "object" || blob === null ||
      typeof blob.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(blob.sha256) ||
      !Number.isSafeInteger(blob.bytes)
    )
  ) {
    throw new WatchdogError(`Invalid blob manifest ${path}`, "shape_drift");
  }
  return value as BlobManifest;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

async function blobFiles(root: string): Promise<string[]> {
  try {
    await access(root);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  return walk(root);
}

async function walk(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const name of (await readdir(root)).sort()) {
    const path = join(root, name);
    const info = await stat(path);
    if (info.isDirectory()) files.push(...await walk(path));
    else if (info.isFile() && name.endsWith(".pdf")) files.push(resolve(path));
  }
  return files.sort();
}

function blobPath(root: string, sha256: string): string {
  return join(root, sha256.slice(0, 2), `${sha256}.pdf`);
}

function objectKey(sourceId: string, sha256: string): string {
  return `${sourceId}/${sha256.slice(0, 2)}/${sha256}.pdf`;
}

function safeDestination(value: string): string {
  const destination = resolve(value);
  const parts = relative(resolve(sep), destination).split(sep).filter(Boolean);
  if (parts.length < 2) {
    throw new WatchdogError(`Restore destination is too broad: ${destination}`, "shape_drift");
  }
  return destination;
}
