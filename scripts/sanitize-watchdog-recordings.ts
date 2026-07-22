/** Remove transient or credential-shaped request fields from committed Watchdog
 * response metadata. Response bodies remain untouched for offline replay. */
import { randomUUID } from "node:crypto";
import { readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { sanitizedRequest } from "../packages/watchdog/src/recording.js";
import type { RecordedResponseMeta } from "../packages/watchdog/src/types.js";

const roots = process.argv.slice(2);
if (roots.length === 0) {
  throw new Error("Pass one or more recording directories under watchdog-data/recordings/");
}

const allowedRoot = resolve("watchdog-data", "recordings");
let examined = 0;
let updated = 0;
for (const rawRoot of roots) {
  const root = resolve(rawRoot);
  if (root !== allowedRoot && !root.startsWith(`${allowedRoot}${sep}`)) {
    throw new Error(`Recording path is outside ${allowedRoot}: ${root}`);
  }
  for (const file of await walk(root)) {
    if (!file.endsWith(".json")) continue;
    const before = await readFile(file, "utf8");
    const value = JSON.parse(before) as RecordedResponseMeta;
    if (!isRecordedResponseMeta(value)) continue;
    examined++;
    value.request = sanitizedRequest(value.request);
    const after = `${JSON.stringify(value, null, 2)}\n`;
    if (after === before) continue;
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, after, { flag: "wx" });
    await rename(temporary, file);
    updated++;
  }
}

process.stdout.write(`recording metadata: ${examined} examined, ${updated} sanitized\n`);

async function walk(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const name of (await readdir(root)).sort()) {
    const path = `${root}${sep}${name}`;
    const entry = await stat(path);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function isRecordedResponseMeta(value: unknown): value is RecordedResponseMeta {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Partial<RecordedResponseMeta>;
  return (
    typeof record.sequence === "number" &&
    typeof record.request === "object" &&
    record.request !== null &&
    typeof record.response === "object" &&
    record.response !== null
  );
}
