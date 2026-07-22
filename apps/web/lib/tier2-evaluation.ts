import "server-only";
import { createHash } from "node:crypto";
import {
  DocumentIntakeSchema,
  validateExtractionDraft,
  type RuleInputContract,
} from "@stampdraft/schema";
import type { Tier2ExtractionProvider } from "./tier2-provider";

export type HighRiskExtractionMetric = "consideration" | "term" | "parties";

export interface Tier2EvaluationFixture {
  caseId: string;
  intake: unknown;
  bytes: Uint8Array;
  contract: RuleInputContract;
  expected: Array<{
    metric: HighRiskExtractionMetric;
    fieldKey: string;
    value: string | null;
  }>;
}

export interface Tier2EvaluationReport {
  cases: number;
  metrics: Record<HighRiskExtractionMetric, {
    true_positives: number;
    false_positives: number;
    false_negatives: number;
    precision: number | null;
    recall: number | null;
  }>;
  precision_gate: 0.95;
  gate_passed: boolean;
}

/** Execute an anonymized labelled fixture set without retaining documents,
 * predictions, expected values, or snippets in the report. */
export async function evaluateTier2Provider(
  provider: Tier2ExtractionProvider,
  fixtures: Tier2EvaluationFixture[],
): Promise<Tier2EvaluationReport> {
  const totals = emptyTotals();
  for (const fixture of [...fixtures].sort((a, b) => a.caseId.localeCompare(b.caseId))) {
    const intake = DocumentIntakeSchema.parse(fixture.intake);
    const documentId = stableUuid(`document:${fixture.caseId}`);
    const draftId = stableUuid(`draft:${fixture.caseId}`);
    const stored = await provider.putDocument({ documentId, bytes: fixture.bytes, intake });
    try {
      const raw = await provider.extractAndStoreDraft({
        documentRef: stored.documentRef,
        documentId,
        draftId,
        contract: fixture.contract,
      });
      const draft = validateExtractionDraft(fixture.contract, raw);
      const fields = new Map(draft.fields.map((field) => [field.key, field]));
      for (const label of fixture.expected) {
        const actual = fields.get(label.fieldKey);
        if (!actual) throw new Error(`evaluation field ${label.fieldKey} is absent from the contract-bound draft`);
        const predicted = actual.status === "found" ? normalize(actual.proposed_value) : null;
        const expected = label.value === null ? null : normalize(label.value);
        if (predicted !== null && expected !== null && predicted === expected) {
          totals[label.metric].true_positives += 1;
        } else {
          if (predicted !== null) totals[label.metric].false_positives += 1;
          if (expected !== null) totals[label.metric].false_negatives += 1;
        }
      }
    } finally {
      await provider.deleteDocumentAndDraft(stored.documentRef);
    }
  }

  const metrics = Object.fromEntries((Object.keys(totals) as HighRiskExtractionMetric[]).map((metric) => {
    const value = totals[metric];
    const predicted = value.true_positives + value.false_positives;
    const expected = value.true_positives + value.false_negatives;
    return [metric, {
      ...value,
      precision: predicted === 0 ? null : value.true_positives / predicted,
      recall: expected === 0 ? null : value.true_positives / expected,
    }];
  })) as Tier2EvaluationReport["metrics"];
  return {
    cases: fixtures.length,
    metrics,
    precision_gate: 0.95,
    gate_passed: (Object.keys(metrics) as HighRiskExtractionMetric[]).every((metric) =>
      metrics[metric].precision !== null && metrics[metric].precision! >= 0.95,
    ),
  };
}

function emptyTotals(): Record<HighRiskExtractionMetric, {
  true_positives: number;
  false_positives: number;
  false_negatives: number;
}> {
  return {
    consideration: { true_positives: 0, false_positives: 0, false_negatives: 0 },
    term: { true_positives: 0, false_positives: 0, false_negatives: 0 },
    parties: { true_positives: 0, false_positives: 0, false_negatives: 0 },
  };
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
}

function stableUuid(seed: string): string {
  const bytes = Buffer.from(createHash("sha256").update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
