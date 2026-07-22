import {
  generateBlobManifest,
  WATCHDOG_BLOB_COLLECTIONS,
  writeBlobManifest,
} from "../packages/watchdog/src/integrity.js";

for (const collection of WATCHDOG_BLOB_COLLECTIONS) {
  const manifest = await generateBlobManifest(collection);
  await writeBlobManifest(collection.manifestPath, manifest);
  process.stdout.write(
    `${manifest.source_id}: ${manifest.document_occurrences} occurrence(s), ${manifest.unique_blobs} blob(s)\n`,
  );
}
