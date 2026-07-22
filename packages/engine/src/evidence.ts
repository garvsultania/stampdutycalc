import { ISODateSchema, type Citation, type ClassificationTree } from "@stampdraft/schema";
import { EngineError } from "./errors.js";
import type { RuleSet } from "./snapshot.js";

export interface EvidenceCatalog {
  documents: ReadonlyArray<{
    sha256: string;
    source_id: string;
    source_row_id: string;
    gazette_date?: string;
  }>;
  sweeps: ReadonlyArray<{
    run_id: string;
    source_id: string;
    range_from: string;
    range_to: string;
    status: "ok" | "failed" | "partial";
  }>;
  events: ReadonlyArray<{
    run_id: string;
    source_id: string;
    type: string;
    documents?: string[];
  }>;
  sources: ReadonlyArray<{
    id: string;
    status: "accepted" | "provisional";
    /** Legacy source IDs present in immutable evidence records. */
    evidence_ids?: string[];
  }>;
}

export interface CitationDependency {
  label: string;
  citation: Citation;
}

export type CorpusEvidenceKind =
  | "rule"
  | "modifier"
  | "penalty"
  | "charging_version"
  | "charging_section"
  | "classification";

export interface CorpusEvidenceDependency extends CitationDependency {
  jurisdiction: string;
  kind: CorpusEvidenceKind;
}

export interface EvidenceCoverageEntry extends CorpusEvidenceDependency {
  supplied: boolean;
  linked: boolean;
  issues: string[];
}

export interface EvidenceCoverage {
  total: number;
  linked: number;
  missing: number;
  invalid: number;
  entries: EvidenceCoverageEntry[];
}

export interface EvidenceGateOptions {
  /** Explicit wall-clock boundary supplied by the application. The pure engine
   * never reads the clock itself. Both amendment and commencement chains must
   * have been reviewed through this date. */
  asOf: string;
}

/** Runtime production gate. Catalog integrity is additionally checked in CI. */
export function assertEvidenceBacked(
  dependencies: readonly CitationDependency[],
  options: EvidenceGateOptions,
): void {
  const asOf = ISODateSchema.parse(options.asOf);
  const missing = dependencies
    .filter((dependency) => dependency.citation.evidence === undefined)
    .map((dependency) => dependency.label);
  if (missing.length > 0) {
    throw new EngineError(
      `production result requires Watchdog-backed primary evidence; missing evidence links: ${missing.join(", ")}`,
      "EVIDENCE_REQUIRED",
    );
  }

  const stale = dependencies.flatMap((dependency) => {
    const evidence = dependency.citation.evidence!;
    const chains = [
      ["amendment", evidence.amendment_chain.checked_through],
      ["commencement", evidence.commencement_chain.checked_through],
    ] as const;
    return chains
      .filter(([, checkedThrough]) => checkedThrough < asOf)
      .map(
        ([chain, checkedThrough]) =>
          `${dependency.label} ${chain} chain (audited through ${checkedThrough})`,
      );
  });
  if (stale.length > 0) {
    throw new EngineError(
      `production result requires evidence current through ${asOf}; stale evidence: ${stale.join(", ")}`,
      "EVIDENCE_REQUIRED",
    );
  }
}

/** Cross-check a supplied citation link against immutable Watchdog records. */
export function citationEvidenceIssues(citation: Citation, catalog: EvidenceCatalog): string[] {
  const evidence = citation.evidence;
  if (!evidence) return ["citation has no evidence link"];
  const issues: string[] = [];

  for (const reference of evidence.documents) {
    const hashMatches = catalog.documents.filter((candidate) => candidate.sha256 === reference.sha256);
    if (hashMatches.length === 0) {
      issues.push(`document ${reference.sha256} is absent from the Watchdog index`);
      continue;
    }
    const sourceMatches = hashMatches.filter((candidate) => candidate.source_id === reference.source_id);
    if (sourceMatches.length === 0) {
      issues.push(
        `document ${reference.sha256} source_id is ${hashMatches.map((candidate) => candidate.source_id).join(", ")}, not ${reference.source_id}`,
      );
      continue;
    }
    const document = sourceMatches.find((candidate) => candidate.source_row_id === reference.source_row_id);
    if (!document) {
      issues.push(`document ${reference.sha256} source_row_id does not match the Watchdog index`);
      continue;
    }
    const publishedOn = normalizeDate(document.gazette_date);
    if (publishedOn !== reference.published_on) {
      issues.push(`document ${reference.sha256} published_on is ${publishedOn ?? "missing"}, not ${reference.published_on}`);
    }
    const acquisition = catalog.sweeps.find((sweep) => sweep.run_id === reference.run_id);
    if (!acquisition) {
      issues.push(`document ${reference.sha256} acquisition run ${reference.run_id} is absent`);
    } else if (acquisition.status === "failed" || acquisition.source_id !== reference.source_id) {
      issues.push(`document ${reference.sha256} acquisition run is not a recorded ${reference.source_id} acquisition`);
    } else if (
      normalizeDate(acquisition.range_from)! > reference.published_on ||
      normalizeDate(acquisition.range_to)! < reference.published_on
    ) {
      issues.push(`document ${reference.sha256} publication date falls outside its acquisition sweep range`);
    }
    const event = catalog.events.find(
      (candidate) =>
        candidate.run_id === reference.run_id &&
        candidate.source_id === reference.source_id &&
        (candidate.type === "new_document" || candidate.type === "document_acquired") &&
        candidate.documents?.includes(reference.sha256),
    );
    if (!event) issues.push(`document ${reference.sha256} is not linked to its acquisition run event`);
    if (!acceptedSource(reference.source_id, catalog)) {
      issues.push(`document ${reference.sha256} source ${reference.source_id} is not accepted`);
    }
  }

  for (const audit of evidence.audits) {
    const sweep = catalog.sweeps.find((candidate) => candidate.run_id === audit.run_id);
    if (!sweep) {
      issues.push(`audit run ${audit.run_id} is absent`);
      continue;
    }
    if (sweep.status !== "ok") issues.push(`audit run ${audit.run_id} has status ${sweep.status}, not ok`);
    if (sweep.source_id !== audit.source_id) {
      issues.push(`audit run ${audit.run_id} source_id is ${sweep.source_id}, not ${audit.source_id}`);
    }
    if (normalizeDate(sweep.range_to) !== audit.audited_through) {
      issues.push(
        `audit ${audit.run_id} derives audited_through ${normalizeDate(sweep.range_to)}, not ${audit.audited_through}`,
      );
    }
    if (!acceptedSource(audit.source_id, catalog)) {
      issues.push(`audit source ${audit.source_id} is not accepted`);
    }
  }

  for (const [chainName, chain] of [
    ["amendment", evidence.amendment_chain],
    ["commencement", evidence.commencement_chain],
  ] as const) {
    for (const sourceId of chain.source_ids) {
      const auditedSweeps = evidence.audits
        .filter((audit) => audit.source_id === sourceId)
        .map((audit) => catalog.sweeps.find((candidate) => candidate.run_id === audit.run_id))
        .filter(
          (sweep): sweep is EvidenceCatalog["sweeps"][number] =>
            sweep !== undefined && sweep.status === "ok" && sweep.source_id === sourceId,
        );
      if (!coversWithoutGaps(auditedSweeps, chain.checked_from, chain.checked_through)) {
        issues.push(
          `${chainName} chain source ${sourceId} has no gap-free successful sweep coverage from ${chain.checked_from} through ${chain.checked_through}`,
        );
      }
    }
  }
  return issues;
}

/** Every legal citation surface in the append-only calculator corpus. */
export function collectCorpusEvidenceDependencies(
  ruleSet: RuleSet,
  trees: readonly ClassificationTree[] = [],
): CorpusEvidenceDependency[] {
  return [
    ...ruleSet.rules.map((rule) => ({
      label: `rule ${rule.rule_id}@${rule.version.effective_from}`,
      jurisdiction: rule.jurisdiction,
      kind: "rule" as const,
      citation: rule.version.source,
    })),
    ...ruleSet.modifiers.map((modifier) => ({
      label: `modifier ${modifier.modifier_id}@${modifier.version.effective_from}`,
      jurisdiction: modifier.jurisdiction,
      kind: "modifier" as const,
      citation: modifier.version.source,
    })),
    ...ruleSet.penaltyRegimes.map((penalty) => ({
      label: `penalty regime ${penalty.regime_id}@${penalty.version.effective_from}`,
      jurisdiction: penalty.jurisdiction,
      kind: "penalty" as const,
      citation: penalty.version.source,
    })),
    ...(ruleSet.chargingRules ?? []).flatMap((charging) => [
      {
        label: `charging rules ${charging.rules_id}@${charging.version.effective_from}`,
        jurisdiction: charging.jurisdiction,
        kind: "charging_version" as const,
        citation: charging.version.source,
      },
      ...(["4", "5", "6"] as const).map((section) => ({
        label: `charging rules ${charging.rules_id} s.${section}@${charging.version.effective_from}`,
        jurisdiction: charging.jurisdiction,
        kind: "charging_section" as const,
        citation: section === "4" ? charging.s4.source : section === "5" ? charging.s5.source : charging.s6.source,
      })),
    ]),
    ...trees.map((tree) => ({
      label: `classification tree ${tree.tree_id}@${tree.version.effective_from}`,
      jurisdiction: tree.jurisdiction,
      kind: "classification" as const,
      citation: tree.version.source,
    })),
  ];
}

/** Coverage is informational for missing draft links and strict for supplied links. */
export function evidenceCoverage(
  dependencies: readonly CorpusEvidenceDependency[],
  catalog: EvidenceCatalog,
): EvidenceCoverage {
  const entries = dependencies.map((dependency) => {
    const supplied = dependency.citation.evidence !== undefined;
    const issues = supplied ? citationEvidenceIssues(dependency.citation, catalog) : [];
    return {
      ...dependency,
      supplied,
      linked: supplied && issues.length === 0,
      issues,
    };
  });
  return {
    total: entries.length,
    linked: entries.filter((entry) => entry.linked).length,
    missing: entries.filter((entry) => !entry.supplied).length,
    invalid: entries.filter((entry) => entry.issues.length > 0).length,
    entries,
  };
}

function acceptedSource(sourceId: string, catalog: EvidenceCatalog): boolean {
  return catalog.sources.some(
    (source) =>
      source.status === "accepted" && (source.id === sourceId || source.evidence_ids?.includes(sourceId) === true),
  );
}

function normalizeDate(value?: string): string | undefined {
  return value?.replaceAll("/", "-");
}

/** A source family may be audited in annual or other adjacent ranges. Accept the
 * named successful sweeps only when their inclusive union covers every civil day
 * in the asserted chain interval. */
function coversWithoutGaps(
  sweeps: ReadonlyArray<EvidenceCatalog["sweeps"][number]>,
  checkedFrom: string,
  checkedThrough: string,
): boolean {
  const day = (value: string): number => Date.parse(`${normalizeDate(value)}T00:00:00.000Z`) / 86_400_000;
  const from = day(checkedFrom);
  const through = day(checkedThrough);
  const intervals = sweeps
    .map((sweep) => ({ from: day(sweep.range_from), through: day(sweep.range_to) }))
    .filter((interval) => Number.isInteger(interval.from) && Number.isInteger(interval.through))
    .sort((left, right) => left.from - right.from || left.through - right.through);

  let coveredThrough = from - 1;
  for (const interval of intervals) {
    if (interval.through < from) continue;
    if (interval.from > coveredThrough + 1) return false;
    coveredThrough = Math.max(coveredThrough, interval.through);
    if (coveredThrough >= through) return true;
  }
  return false;
}
