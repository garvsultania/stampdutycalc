import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assessEvidenceLinkProposal,
  evidenceCoverage,
  loadStateDir,
  type EvidenceLinkProposal,
} from "@stampdraft/engine";
import type { Citation } from "@stampdraft/schema";
import { loadEvidenceCatalog } from "../packages/watchdog/src/catalog.js";

const PROPOSALS = readdirSync("review-packets")
  .filter((file) => file.endsWith(".json"))
  .sort()
  .flatMap((file) => {
    const path = `review-packets/${file}`;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as EvidenceLinkProposal | EvidenceLinkProposal[];
    const proposals = Array.isArray(parsed) ? parsed : [parsed];
    return proposals.map((proposal, index) => ({
      file: proposals.length === 1 ? path : `${path}#${index + 1}`,
      proposal,
    }));
  });
const CONTENT_EXTRACTION = JSON.parse(
  readFileSync("WATCHDOG-MH-CONTENT-EXTRACTION.json", "utf8"),
);
const GOLDEN_NAMES = new Set(
  readdirSync("golden/MH")
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) =>
      (JSON.parse(readFileSync(`golden/MH/${file}`, "utf8")) as Array<{ name: string }>).map(
        (test) => test.name,
      ),
    ),
);

describe("prepared evidence-link proposals", () => {
  it("binds every proposal to its exact dependency, blob, extraction receipt, catalog record, and intervals", () => {
    const load = loadStateDir("rules/MH");
    const catalog = loadEvidenceCatalog("watchdog-data");
    expect(load.parseErrors).toEqual([]);
    expect(PROPOSALS.length).toBeGreaterThanOrEqual(3);

    for (const { file, proposal } of PROPOSALS) {
      const target = resolveTarget(proposal, load);
      expect(target, file).toBeDefined();
      expect(target!.verified_by, file).toBeNull();
      expect(target!.verified_on, file).toBeNull();
      expect(target!.citation.evidence, file).toBeUndefined();
      expect(findForbiddenReviewField(proposal), file).toBeUndefined();

      for (const testName of Object.values(proposal.review_context.tests).flat()) {
        expect(testReceiptExists(testName), `${file}: missing test receipt ${testName}`).toBe(true);
      }

      for (const receipt of proposal.source_text_receipts) {
        const contentReceipt = findByHash(CONTENT_EXTRACTION, receipt.sha256);
        expect(contentReceipt, file).toMatchObject({
          status: "text",
          text_sha256: receipt.text_sha256,
        });
        expect(Number(contentReceipt!.pages_with_text), file).toBeGreaterThanOrEqual(
          Math.max(...receipt.pages),
        );
      }

      expect(assessEvidenceLinkProposal(proposal, target!.citation, catalog), file).toEqual({
        mechanically_valid: true,
        issues: [],
      });
    }
  });

  it("keeps every proposal outside production evidence coverage until human review", () => {
    const load = loadStateDir("rules/MH");
    const catalog = loadEvidenceCatalog("watchdog-data");
    const dependencies = PROPOSALS.map(({ proposal }) => {
      const target = resolveTarget(proposal, load)!;
      return {
        label: `${proposal.target.kind} ${proposal.target.id}@${proposal.target.effective_from}`,
        jurisdiction: proposal.target.jurisdiction,
        kind: proposal.target.kind,
        citation: target.citation,
      };
    });

    expect(evidenceCoverage(dependencies, catalog)).toMatchObject({
      total: PROPOSALS.length,
      linked: 0,
      missing: PROPOSALS.length,
      invalid: 0,
    });
  });
});

function resolveTarget(
  proposal: EvidenceLinkProposal,
  load: ReturnType<typeof loadStateDir>,
): { citation: Citation; verified_by: string | null; verified_on: string | null } | undefined {
  const { kind, id, effective_from } = proposal.target;
  if (kind === "classification") {
    const candidate = load.trees.find(
      (item) => item.tree_id === id && item.version.effective_from === effective_from,
    );
    return candidate ? versionTarget(candidate.version) : undefined;
  }
  if (kind === "charging_version" || kind === "charging_section") {
    const candidate = load.ruleSet.chargingRules?.find(
      (item) => item.rules_id === id && item.version.effective_from === effective_from,
    );
    if (!candidate) return undefined;
    if (kind === "charging_version") return versionTarget(candidate.version);
    const citation = proposal.target.section === "4"
      ? candidate.s4.source
      : proposal.target.section === "5"
        ? candidate.s5.source
        : proposal.target.section === "6"
          ? candidate.s6.source
          : undefined;
    return citation
      ? { citation, verified_by: candidate.version.verified_by, verified_on: candidate.version.verified_on }
      : undefined;
  }
  const candidate = kind === "rule"
    ? load.ruleSet.rules.find(
        (item) => item.rule_id === id && item.version.effective_from === effective_from,
      )
    : kind === "modifier"
      ? load.ruleSet.modifiers.find(
          (item) => item.modifier_id === id && item.version.effective_from === effective_from,
        )
      : load.ruleSet.penaltyRegimes.find(
          (item) => item.regime_id === id && item.version.effective_from === effective_from,
        );
  if (!candidate) return undefined;
  return versionTarget(candidate.version);
}

function versionTarget(version: {
  source: Citation;
  verified_by: string | null;
  verified_on: string | null;
}) {
  return { citation: version.source, verified_by: version.verified_by, verified_on: version.verified_on };
}

function testReceiptExists(receipt: string): boolean {
  if (GOLDEN_NAMES.has(receipt)) return true;
  const match = receipt.match(/^vitest:([^#]+)#(.+)$/);
  if (!match) return false;
  try {
    return readFileSync(match[1]!, "utf8").includes(match[2]!);
  } catch {
    return false;
  }
}

function findByHash(value: unknown, sha256: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findByHash(item, sha256);
      if (hit) return hit;
    }
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.sha256 === sha256) return record;
    for (const item of Object.values(record)) {
      const hit = findByHash(item, sha256);
      if (hit) return hit;
    }
  }
  return undefined;
}

function findForbiddenReviewField(value: unknown, path = "proposal"): string | undefined {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const hit = findForbiddenReviewField(item, `${path}[${index}]`);
      if (hit) return hit;
    }
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (["reviewed_by", "reviewed_on", "verified_by", "verified_on"].includes(key)) {
        return `${path}.${key}`;
      }
      const hit = findForbiddenReviewField(item, `${path}.${key}`);
      if (hit) return hit;
    }
  }
  return undefined;
}
