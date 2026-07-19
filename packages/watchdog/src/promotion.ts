import type { SourceDefinition } from "./sources.js";
import type { DocumentRecord, SweepRun, WatchdogEvent } from "./types.js";

export interface SourcePromotionReport {
  source_id: string;
  eligible: boolean;
  reasons: string[];
  complete_runs: string[];
  stable_range?: { from: string; to: string; rows: number; pages: number };
}

interface PromotionRequirement {
  minimumRows: number;
  minimumPages: number;
  repeatRuns: number;
  sentinelTitles?: RegExp[];
  sentinelHashes?: string[];
}

const REQUIREMENTS: Record<string, PromotionRequirement> = {
  "mh-egazette-part8": {
    minimumRows: 195,
    minimumPages: 2,
    repeatRuns: 2,
    sentinelTitles: [
      /MAHARASHTRA ACT No\. LXIII OF 2025/i,
      /MAHARASHTRA ACT No\. XIII OF 2026/i,
      /MAHARASHTRA ACT No\. XVI OF 2026/i,
      /MAHARASHTRA ACT No\. XXIX OF 2026/i,
    ],
  },
  "mh-egazette-part4b": {
    minimumRows: 2_575,
    minimumPages: 26,
    repeatRuns: 2,
    sentinelHashes: ["1d2695a0be9714d2cc94e9218e9ce4fdff28a12e0968fae0dda9aad4e835d07f"],
  },
};

/** Machine-check the committed facts that justify an accepted source. A source
 * definition may request accepted status, but the evidence catalog only exposes
 * it as accepted when this report passes. */
export function assessSourcePromotion(
  source: SourceDefinition,
  documents: readonly DocumentRecord[],
  sweeps: readonly SweepRun[],
  events: readonly WatchdogEvent[],
): SourcePromotionReport {
  const requirement = REQUIREMENTS[source.id];
  if (!requirement) {
    return {
      source_id: source.id,
      eligible: false,
      reasons: ["no machine-checkable promotion requirement is registered"],
      complete_runs: [],
    };
  }

  const evidenceIds = new Set([source.id, ...(source.evidence_ids ?? [])]);
  const sourceDocuments = documents.filter((document) => evidenceIds.has(document.source_id));
  const sourceSweeps = sweeps.filter(
    (sweep) => evidenceIds.has(sweep.source_id) && sweep.status === "ok",
  );
  const grouped = new Map<string, SweepRun[]>();
  for (const sweep of sourceSweeps) {
    if (
      sweep.rows_seen < requirement.minimumRows ||
      (sweep.pages_fetched ?? 0) < requirement.minimumPages ||
      sweep.pages_fetched !== sweep.pages_expected
    ) {
      continue;
    }
    const key = [sweep.range_from, sweep.range_to, sweep.rows_seen, sweep.pages_fetched].join("\u0000");
    const group = grouped.get(key) ?? [];
    group.push(sweep);
    grouped.set(key, group);
  }
  const stable = [...grouped.values()]
    .filter((runs) => runs.length >= requirement.repeatRuns)
    .sort((left, right) => right.length - left.length)[0];
  const reasons: string[] = [];
  if (!stable) reasons.push(`fewer than ${requirement.repeatRuns} identical complete runs satisfy the source floor`);

  const expectedRows = stable?.[0]?.rows_seen ?? requirement.minimumRows;
  if (sourceDocuments.length !== expectedRows) {
    reasons.push(`document occurrences are ${sourceDocuments.length}, expected ${expectedRows}`);
  }
  if (new Set(sourceDocuments.map((document) => document.source_row_id)).size !== sourceDocuments.length) {
    reasons.push("document source-row identities are not unique");
  }
  for (const sentinel of requirement.sentinelTitles ?? []) {
    if (!sourceDocuments.some((document) => sentinel.test(document.title))) {
      reasons.push(`required sentinel title is absent: ${sentinel.source}`);
    }
  }
  for (const sha256 of requirement.sentinelHashes ?? []) {
    if (!sourceDocuments.some((document) => document.sha256 === sha256)) {
      reasons.push(`required sentinel hash is absent: ${sha256}`);
    }
  }

  const latest = stable
    ? [...stable].sort((left, right) => right.finished_at.localeCompare(left.finished_at))[0]
    : undefined;
  if (
    latest &&
    events.some(
      (event) => event.run_id === latest.run_id && event.type === "new_document" && (event.documents?.length ?? 0) > 0,
    )
  ) {
    reasons.push(`latest repeat run ${latest.run_id} still emitted new document occurrences`);
  }

  return {
    source_id: source.id,
    eligible: reasons.length === 0,
    reasons,
    complete_runs: stable?.map((run) => run.run_id) ?? [],
    ...(stable
      ? {
          stable_range: {
            from: stable[0]!.range_from,
            to: stable[0]!.range_to,
            rows: stable[0]!.rows_seen,
            pages: stable[0]!.pages_fetched!,
          },
        }
      : {}),
  };
}
