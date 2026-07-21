import { describe, expect, it } from "vitest";
import { RuleSchema, type Citation, type Rule } from "@stampdraft/schema";
import { computeWithTrace } from "./compute.js";
import { assessComputationReleaseCandidate, buildFounderReviewPacket } from "./release-candidate.js";
import type { EvidenceCatalog } from "./evidence.js";
import type { RuleSet } from "./snapshot.js";

const SHA = "a".repeat(64);
const RUN = "accepted-run";
const SOURCE = "official-gazette";

describe("dependency-bounded release candidates", () => {
  it("separates founder verification from evidence-complete review readiness", () => {
    const citation = evidencedCitation();
    const rule = makeRule(citation, null);
    const traced = computeWithTrace(ruleSet(rule), input());
    const candidate = assessComputationReleaseCandidate(traced, catalog("accepted"), "2026-07-21", {
      encoded_diff: diffReceipt(),
      tests: {
        present_day: ["golden/example — present-day"],
        boundaries: ["golden/example — day-before/day-of"],
        negative_cases: ["golden/example — unsupported adjacent classification refuses"],
      },
      open_refusals: ["another instrument remains refused"],
      canary: { id: null, status: "not_applicable", detail: "No official calculator exists for this fixed duty." },
    });

    expect(candidate).toMatchObject({
      review_ready: true,
      production_ready: false,
      review_blockers: [],
      production_blockers: ["rule R: founder verification is pending"],
      dependencies: [{
        kind: "rule",
        id: "R",
        document_hashes: [SHA],
        evidence_documents: [{
          sha256: SHA,
          source_id: SOURCE,
          source_row_id: "row-1",
          run_id: RUN,
          published_on: "2020-01-01",
          role: "base_act",
          locator: { kind: "section", value: "s.1" },
        }],
        amendment_chain: expect.objectContaining({ checked_through: "2026-07-21" }),
        commencement_chain: expect.objectContaining({ checked_through: "2026-07-21" }),
        evidence_issues: [],
      }],
    });
    expect(buildFounderReviewPacket(candidate)).toMatchObject({
      disposition: "ready_for_founder_review",
      allowed_actions: ["approve_and_merge", "request_correction", "leave_refused"],
      candidate: { review_ready: true, production_ready: false },
    });
  });

  it("fails closed on missing evidence, receipts, canaries, or stale chains", () => {
    const rule = makeRule({ type: "act", ref: "draft", quoted_text: "draft text" }, "2026-07-20");
    const traced = computeWithTrace(ruleSet(rule), input());
    const candidate = assessComputationReleaseCandidate(traced, catalog("provisional"), "2026-07-21", {
      encoded_diff: { base_revision: "", candidate_revision: "", changed_paths: [], summary: "" },
      tests: { present_day: [], boundaries: [], negative_cases: [] },
      open_refusals: [],
      canary: { id: "portal-case-1", status: "unexplained_divergence", detail: "Portal differs." },
    });

    expect(candidate.review_ready).toBe(false);
    expect(candidate.production_ready).toBe(false);
    expect(candidate.review_blockers).toEqual(expect.arrayContaining([
      "no complete encoded-diff receipt is attached",
      "no present-day golden receipt is attached",
      "no boundary golden receipt is attached",
      "no negative/refusal-neighbour receipt is attached",
      "canary portal-case-1 has an unexplained divergence",
      "rule R: citation has no evidence link",
    ]));
    expect(buildFounderReviewPacket(candidate).disposition).toBe("blocked_before_founder_review");
  });

  it("marks an already founder-approved dependency production-ready without mutating it", () => {
    const citation = evidencedCitation();
    const traced = computeWithTrace(ruleSet(makeRule(citation, "2026-07-21")), input());
    const candidate = assessComputationReleaseCandidate(traced, catalog("accepted"), "2026-07-21", {
      encoded_diff: diffReceipt(),
      tests: {
        present_day: ["present"],
        boundaries: ["boundary"],
        negative_cases: ["negative"],
      },
      open_refusals: [],
      canary: { id: null, status: "not_applicable", detail: "No portal." },
    });

    expect(buildFounderReviewPacket(candidate)).toMatchObject({
      disposition: "production_ready",
      candidate: { production_ready: true },
    });
  });
});

function diffReceipt() {
  return {
    base_revision: "base-sha",
    candidate_revision: "candidate-sha",
    changed_paths: ["rules/DL/rules/example.json"],
    summary: "Append one source-backed effective-date era.",
  };
}

function evidencedCitation(): Citation {
  return {
    type: "act",
    ref: "Official Act s.1",
    quoted_text: "Duty is one hundred rupees.",
    evidence: {
      documents: [{
        sha256: SHA,
        source_id: SOURCE,
        source_row_id: "row-1",
        run_id: RUN,
        published_on: "2020-01-01",
        role: "base_act",
        locator: { kind: "section", value: "s.1" },
      }],
      audits: [{ source_id: SOURCE, run_id: RUN, audited_through: "2026-07-21" }],
      amendment_chain: {
        checked_from: "2020-01-01",
        checked_through: "2026-07-21",
        source_ids: [SOURCE],
        documents: [SHA],
      },
      commencement_chain: {
        checked_from: "2020-01-01",
        checked_through: "2026-07-21",
        source_ids: [SOURCE],
        documents: [SHA],
      },
      reviewed_by: "legal-reviewer",
      reviewed_on: "2026-07-21",
    },
  };
}

function makeRule(citation: Citation, verifiedOn: string | null): Rule {
  return RuleSchema.parse({
    rule_id: "R",
    jurisdiction: "DL",
    act: "Official Act",
    article: "1",
    instrument: "conveyance_sale_deed",
    version: {
      effective_from: "2020-01-01",
      effective_to: null,
      source: citation,
      verified_by: verifiedOn === null ? null : "founder",
      verified_on: verifiedOn,
    },
    charge: { kind: "fixed", amount: "100" },
    rounding: { mode: "none", nearest: 1 },
  });
}

function ruleSet(rule: Rule): RuleSet {
  return { rules: [rule], modifiers: [], penaltyRegimes: [] };
}

function input() {
  return { jurisdiction: "DL" as const, rule_id: "R", execution_date: "2026-07-21", values: {}, facts: {} };
}

function catalog(status: "accepted" | "provisional"): EvidenceCatalog {
  return {
    documents: [{ sha256: SHA, source_id: SOURCE, source_row_id: "row-1", gazette_date: "2020/01/01" }],
    sweeps: [{ run_id: RUN, source_id: SOURCE, range_from: "2020-01-01", range_to: "2026-07-21", status: "ok" }],
    events: [{ run_id: RUN, source_id: SOURCE, type: "document_acquired", documents: [SHA] }],
    sources: [{ id: SOURCE, status }],
  };
}
