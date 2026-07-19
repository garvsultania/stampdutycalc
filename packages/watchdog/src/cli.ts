#!/usr/bin/env node
import { resolve } from "node:path";
import { EvidenceStore } from "./archive.js";
import { loadEvidenceCatalog } from "./catalog.js";
import { HttpFetcher } from "./fetcher.js";
import { mhPart4bAdapter, mhPart8Adapter } from "./mh-adapter.js";
import { probeSource } from "./probe.js";
import { ResponseRecorder } from "./recording.js";
import { runSweep } from "./sweep.js";

interface Args {
  command?: string;
  source?: string;
  from?: string;
  to?: string;
  live: boolean;
  record: boolean;
  resume: boolean;
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
  if (args.command === "sources") {
    for (const source of loadEvidenceCatalog(resolve("watchdog-data")).sources) {
      process.stdout.write(`${source.id}\t${source.status}\t${source.adapter}\t${source.name}\n`);
    }
    return 0;
  }
  if (args.command === "probe") {
    if (!args.source) return usage("A source id is required for probe.");
    if (!args.live) return usage("Network access is disabled unless --live is explicit.");
    try {
      const report = await probeSource(
        new HttpFetcher(),
        args.source,
        resolve("watchdog-data", "sources", args.source, "state", "probe.jsonl"),
      );
      process.stdout.write(`${JSON.stringify(report)}\n`);
      return 0;
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
  if (args.command !== "sweep" || !["mh-egazette", "mh-egazette-part8", "mh-egazette-part4b"].includes(args.source ?? "")) {
    return usage("Only supported Maharashtra e-Gazette sources can run live; use `probe` for other provisional-source checks.");
  }
  if (!args.from || !args.to) return usage("Both --from and --to are required.");
  if (!args.live) return usage("Network access is disabled unless --live is explicit.");

  const runLabel = args.recordLabel ?? `${args.from}_${args.to}`;
  const recorder = args.record
    ? new ResponseRecorder(resolve("watchdog-data", "recordings", runLabel))
    : undefined;
  const fetcher = new HttpFetcher({ record: recorder ? (response) => recorder.record(response) : undefined });
  const part4b = args.source === "mh-egazette-part4b";
  const adapter = part4b ? mhPart4bAdapter() : mhPart8Adapter();
  const evidence = part4b
    ? new EvidenceStore(resolve("watchdog-data", "sources", "mh-egazette-part4b"), "mh-egazette-part4b")
    : new EvidenceStore(resolve("watchdog-data"));

  try {
    const report = await runSweep(
      adapter,
      {
        from: args.from,
        to: args.to,
        ...(args.limit === undefined ? {} : { limit: args.limit }),
        ...(args.resume ? { resume: true } : {}),
      },
      {
        fetcher,
        evidence,
        onProgress(progress) {
          if (progress.phase === "listing") {
            process.stderr.write(
              `listing page=${progress.pagesFetched}/${progress.pagesExpected ?? "?"} rows=${progress.rows}\n`,
            );
            return;
          }
          const covered = progress.documentsFetched + progress.documentsReused;
          if (covered === progress.documentsTotal || covered % 100 === 0) {
            process.stderr.write(
              `documents covered=${covered}/${progress.documentsTotal} fetched=${progress.documentsFetched} reused=${progress.documentsReused}\n`,
            );
          }
        },
      },
    );
    process.stdout.write(
      `source=${args.source} range=${args.from}..${args.to} status=${report.status} rows=${report.rows} ` +
        `pages_fetched=${report.pagesFetched} pages_expected=${report.pagesExpected ?? "unknown"} ` +
        `documents_fetched=${report.documentsFetched} documents_reused=${report.documentsReused} new_blobs=${report.newBlobs} ` +
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
  const args: Args = { command, source, live: false, record: false, resume: false };
  for (let index = 0; index < rest.length; index++) {
    const value = rest[index]!;
    if (value === "--live") args.live = true;
    else if (value === "--record") args.record = true;
    else if (value === "--resume") args.resume = true;
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
    `${message}\nUsage:\n  pnpm watchdog sources\n  pnpm watchdog probe SOURCE --live\n  ` +
      `pnpm watchdog sweep mh-egazette-part8 --from YYYY-MM-DD --to YYYY-MM-DD --live ` +
      `[--resume] [--record] [--record-label LABEL] [--limit N]\n  ` +
      `pnpm watchdog sweep mh-egazette-part4b --from YYYY-MM-DD --to YYYY-MM-DD --live ` +
      `[--resume] [--record] [--record-label LABEL] [--limit N]\n`,
  );
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
