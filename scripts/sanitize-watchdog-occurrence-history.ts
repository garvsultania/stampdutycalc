/** Redact transient request state from an append-only occurrence history while
 * preserving an explicit audit fact that redaction occurred. */
import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { sanitizeOccurrenceHistoryRecord } from "../packages/watchdog/src/archive.js";
import type { OccurrenceHistoryRecord } from "../packages/watchdog/src/types.js";

const files = process.argv.slice(2).map((file) => resolve(file));
if (files.length === 0) throw new Error("Pass one or more occurrence-history.jsonl files");
const allowedRoot = resolve("watchdog-data");

let records = 0;
let redacted = 0;
for (const file of files) {
  if (!file.startsWith(`${allowedRoot}${sep}`) || !file.endsWith(`${sep}state${sep}occurrence-history.jsonl`)) {
    throw new Error(`Occurrence-history path is outside the expected Watchdog state layout: ${file}`);
  }
  const before = await readFile(file, "utf8");
  const values = before.split("\n").filter(Boolean).map((line) => JSON.parse(line) as OccurrenceHistoryRecord);
  const sanitized = values.map((value) => sanitizeOccurrenceHistoryRecord(value));
  records += sanitized.length;
  redacted += sanitized.filter((value, index) => JSON.stringify(value) !== JSON.stringify(values[index])).length;
  const after = `${sanitized.map((value) => JSON.stringify(value)).join("\n")}\n`;
  if (after === before) continue;
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, after, { flag: "wx" });
  await rename(temporary, file);
}

process.stdout.write(`occurrence history: ${records} record(s), ${redacted} sanitized\n`);
