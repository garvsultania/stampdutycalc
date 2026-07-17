#!/usr/bin/env node
import { resolve } from "node:path";
import { EvidenceStore } from "./archive.js";
import { HttpFetcher } from "./fetcher.js";
import { ResponseRecorder } from "./recording.js";
import { runMhEgazetteSweep } from "./sweep.js";

interface Args {
  command?: string;
  source?: string;
  from?: string;
  to?: string;
  live: boolean;
  record: boolean;
  limit?: number;
  recordLabel?: string;
}

async function main(argv: string[]): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }
  if (args.command !== "sweep" || args.source !== "mh-egazette") return usage("Only `sweep mh-egazette` is supported in v1.");
  if (!args.from || !args.to) return usage("Both --from and --to are required.");
  if (!args.live) return usage("Network access is disabled unless --live is explicit.");

  const runLabel = args.recordLabel ?? `${args.from}_${args.to}`;
  const recorder = args.record
    ? new ResponseRecorder(resolve("watchdog-data", "recordings", runLabel))
    : undefined;
  const fetcher = new HttpFetcher({ record: recorder ? (response) => recorder.record(response) : undefined });
  const evidence = new EvidenceStore(resolve("watchdog-data"));

  try {
    const report = await runMhEgazetteSweep(
      { from: args.from, to: args.to, ...(args.limit === undefined ? {} : { limit: args.limit }) },
      { fetcher, evidence },
    );
    process.stdout.write(
      `source=mh-egazette range=${args.from}..${args.to} status=${report.status} rows=${report.rows} ` +
        `pages_fetched=${report.pagesFetched} pages_expected=${report.pagesExpected ?? "unknown"} ` +
        `documents_fetched=${report.documentsFetched} new_blobs=${report.newBlobs} ` +
        `new_documents=${report.newDocuments.length}\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function parseArgs(argv: string[]): Args {
  const [command, source, ...rest] = argv;
  const args: Args = { command, source, live: false, record: false };
  for (let index = 0; index < rest.length; index++) {
    const value = rest[index]!;
    if (value === "--live") args.live = true;
    else if (value === "--record") args.record = true;
    else if (value === "--from") args.from = rest[++index];
    else if (value === "--to") args.to = rest[++index];
    else if (value === "--limit") {
      const limit = Number(rest[++index]);
      if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
      args.limit = limit;
    } else if (value === "--record-label") {
      const recordLabel = rest[++index];
      if (!recordLabel || !/^[a-zA-Z0-9._-]+$/.test(recordLabel)) {
        throw new Error("--record-label must contain only letters, numbers, dots, underscores, or hyphens");
      }
      args.recordLabel = recordLabel;
    } else throw new Error(`Unknown argument ${value}`);
  }
  return args;
}

function usage(message: string): number {
  process.stderr.write(
    `${message}\nUsage: pnpm watchdog sweep mh-egazette --from YYYY-MM-DD --to YYYY-MM-DD --live ` +
      `[--record] [--record-label LABEL] [--limit N]\n`,
  );
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
