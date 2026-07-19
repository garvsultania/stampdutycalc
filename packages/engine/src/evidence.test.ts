import { describe, expect, it } from "vitest";
import {
  CitationSchema,
  ClassificationTreeSchema,
  RuleSchema,
  type Citation,
  type Rule,
} from "@stampdraft/schema";
import {
  assertEvidenceBacked,
  citationEvidenceIssues,
  classify,
  collectCorpusEvidenceDependencies,
  compute,
  evidenceCoverage,
  type EvidenceCatalog,
  type RuleSet,
} from "./index.js";

const SHA = "a".repeat(64);
const ACQUISITION_RUN = "acquisition-2025-04-15";
const AUDIT_RUN = "sweep-2026-07-19";
const LEGACY_SOURCE = "mh-egazette";

function evidenceCitation(overrides: Record<string, unknown> = {}): Citation {
  return CitationSchema.parse({
    type: "act",
    ref: "Official Act, s.1",
    quoted_text: "The operative primary text.",
    evidence: {
      documents: [
        {
          sha256: SHA,
          source_id: LEGACY_SOURCE,
          source_row_id: "row-1",
          run_id: ACQUISITION_RUN,
          published_on: "2025-04-15",
          role: "base_act",
          locator: { kind: "section", value: "s.1" },
        },
      ],
      audits: [{ source_id: LEGACY_SOURCE, run_id: AUDIT_RUN, audited_through: "2026-07-19" }],
      amendment_chain: {
        checked_from: "2025-04-09",
        checked_through: "2026-07-19",
        source_ids: [LEGACY_SOURCE],
        documents: [],
      },
      commencement_chain: {
        checked_from: "2025-04-09",
        checked_through: "2026-07-19",
        source_ids: [LEGACY_SOURCE],
        documents: [],
      },
      reviewed_by: "founder",
      reviewed_on: "2026-07-19",
    },
    ...overrides,
  });
}

const catalog: EvidenceCatalog = {
  documents: [
    {
      sha256: SHA,
      source_id: LEGACY_SOURCE,
      source_row_id: "row-1",
      gazette_date: "2025/04/15",
    },
  ],
  sweeps: [
    {
      run_id: ACQUISITION_RUN,
      source_id: LEGACY_SOURCE,
      range_from: "2025-04-15",
      range_to: "2025-04-15",
      status: "partial",
    },
    {
      run_id: AUDIT_RUN,
      source_id: LEGACY_SOURCE,
      range_from: "2025-04-09",
      range_to: "2026-07-19",
      status: "ok",
    },
  ],
  events: [
    {
      run_id: ACQUISITION_RUN,
      source_id: LEGACY_SOURCE,
      type: "new_document",
      documents: [SHA],
    },
  ],
  sources: [
    {
      id: "mh-egazette-part8",
      evidence_ids: [LEGACY_SOURCE],
      status: "accepted",
    },
  ],
};

function makeRule(source: Citation): Rule {
  return RuleSchema.parse({
    rule_id: "R",
    jurisdiction: "MH",
    act: "Official Act",
    article: "1",
    instrument: "agreement_general",
    version: {
      effective_from: "2025-04-15",
      effective_to: null,
      supersedes: null,
      source,
      verified_by: null,
      verified_on: null,
    },
    charge: { kind: "fixed", amount: "100" },
    modifiers: [],
    rounding: { mode: "none", nearest: 1 },
    pending_verification: [],
    notes_for_reviewer: "",
  });
}

describe("Watchdog citation evidence", () => {
  it("validates an exact immutable document, acquisition event, audit sweep, and legacy source alias", () => {
    expect(citationEvidenceIssues(evidenceCitation(), catalog)).toEqual([]);
  });

  it("rejects a supplied link whose sweep does not cover the asserted chain", () => {
    const shortCatalog: EvidenceCatalog = {
      ...catalog,
      sweeps: catalog.sweeps.map((sweep) =>
        sweep.run_id === AUDIT_RUN ? { ...sweep, range_from: "2025-05-01" } : sweep,
      ),
    };
    expect(citationEvidenceIssues(evidenceCitation(), shortCatalog)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("amendment chain source mh-egazette has no gap-free successful sweep coverage"),
        expect.stringContaining("commencement chain source mh-egazette has no gap-free successful sweep coverage"),
      ]),
    );
  });

  it("accepts a gap-free union of named successful audit sweeps", () => {
    const firstRun = "audit-2025";
    const secondRun = "audit-2026";
    const raw = JSON.parse(JSON.stringify(evidenceCitation())) as {
      evidence: {
        audits: Array<{ source_id: string; run_id: string; audited_through: string }>;
      };
    };
    raw.evidence.audits = [
      { source_id: LEGACY_SOURCE, run_id: firstRun, audited_through: "2025-12-31" },
      { source_id: LEGACY_SOURCE, run_id: secondRun, audited_through: "2026-07-19" },
    ];
    const citation = CitationSchema.parse(raw);
    const splitCatalog: EvidenceCatalog = {
      ...catalog,
      sweeps: [
        catalog.sweeps[0]!,
        {
          run_id: firstRun,
          source_id: LEGACY_SOURCE,
          range_from: "2025-04-09",
          range_to: "2025-12-31",
          status: "ok",
        },
        {
          run_id: secondRun,
          source_id: LEGACY_SOURCE,
          range_from: "2026-01-01",
          range_to: "2026-07-19",
          status: "ok",
        },
      ],
    };

    expect(citationEvidenceIssues(citation, splitCatalog)).toEqual([]);
  });

  it("rejects named audit sweeps with a one-day gap", () => {
    const firstRun = "audit-2025";
    const secondRun = "audit-2026";
    const raw = JSON.parse(JSON.stringify(evidenceCitation())) as {
      evidence: {
        audits: Array<{ source_id: string; run_id: string; audited_through: string }>;
      };
    };
    raw.evidence.audits = [
      { source_id: LEGACY_SOURCE, run_id: firstRun, audited_through: "2025-12-30" },
      { source_id: LEGACY_SOURCE, run_id: secondRun, audited_through: "2026-07-19" },
    ];
    const citation = CitationSchema.parse(raw);
    const splitCatalog: EvidenceCatalog = {
      ...catalog,
      sweeps: [
        catalog.sweeps[0]!,
        {
          run_id: firstRun,
          source_id: LEGACY_SOURCE,
          range_from: "2025-04-09",
          range_to: "2025-12-30",
          status: "ok",
        },
        {
          run_id: secondRun,
          source_id: LEGACY_SOURCE,
          range_from: "2026-01-01",
          range_to: "2026-07-19",
          status: "ok",
        },
      ],
    };

    expect(citationEvidenceIssues(citation, splitCatalog)).toEqual(
      expect.arrayContaining([expect.stringContaining("no gap-free successful sweep coverage")]),
    );
  });

  it("requires both evidence presence and current amendment/commencement audits", () => {
    const missing = CitationSchema.parse({ type: "act", ref: "draft", quoted_text: "draft" });
    expect(() => assertEvidenceBacked([{ label: "rule R", citation: missing }], { asOf: "2026-07-19" })).toThrow(
      /missing evidence links: rule R/,
    );
    expect(() =>
      assertEvidenceBacked([{ label: "rule R", citation: evidenceCitation() }], { asOf: "2026-07-20" }),
    ).toThrow(/evidence current through 2026-07-20/);
    expect(() =>
      assertEvidenceBacked([{ label: "rule R", citation: evidenceCitation() }], { asOf: "2026-07-19" }),
    ).not.toThrow();
  });

  it("keeps draft computation compatible but makes the production evidence gate explicit and fresh", () => {
    const draftRuleSet: RuleSet = { rules: [makeRule(CitationSchema.parse({ type: "act", ref: "draft", quoted_text: "draft" }))], modifiers: [], penaltyRegimes: [] };
    const backedRuleSet: RuleSet = { rules: [makeRule(evidenceCitation())], modifiers: [], penaltyRegimes: [] };
    const input = {
      jurisdiction: "MH" as const,
      rule_id: "R",
      execution_date: "2026-01-01",
      values: {},
      facts: {},
    };

    expect(compute(draftRuleSet, input).total_duty).toBe("100");
    expect(() => compute(draftRuleSet, input, { requireEvidence: true })).toThrow(/explicit evidenceAsOf/);
    expect(() =>
      compute(draftRuleSet, input, { requireEvidence: true, evidenceAsOf: "2026-07-19" }),
    ).toThrow(/missing evidence links: rule R/);
    expect(
      compute(backedRuleSet, input, { requireEvidence: true, evidenceAsOf: "2026-07-19" }).total_duty,
    ).toBe("100");
  });

  it("reports missing draft coverage without treating it as an invalid supplied link", () => {
    const ruleSet: RuleSet = {
      rules: [makeRule(CitationSchema.parse({ type: "act", ref: "draft", quoted_text: "draft" }))],
      modifiers: [],
      penaltyRegimes: [],
    };
    const dependencies = collectCorpusEvidenceDependencies(ruleSet);
    expect(evidenceCoverage(dependencies, catalog)).toMatchObject({
      total: 1,
      linked: 0,
      missing: 1,
      invalid: 0,
    });
  });

  it("enforces evidence presence and freshness on the classification path", () => {
    const makeTree = (source: Citation) =>
      ClassificationTreeSchema.parse({
        tree_id: "evidence-tree",
        jurisdiction: "MH",
        instrument_class: "test",
        root: "question",
        nodes: {
          question: {
            type: "question",
            text: "Question?",
            legal_test: "Primary legal test.",
            edges: [{ answer: "yes", to: "terminal" }],
          },
          terminal: { type: "terminal", instrument: "agreement_general", article: "1", rule_id: "R" },
        },
        pending_verification: [],
        version: {
          effective_from: "2025-04-15",
          effective_to: null,
          supersedes: null,
          source,
          verified_by: null,
          verified_on: null,
        },
      });
    const draft = makeTree(CitationSchema.parse({ type: "act", ref: "draft", quoted_text: "draft" }));
    const backed = makeTree(evidenceCitation());

    expect(() =>
      classify(draft, {}, {
        executionDate: "2026-01-01",
        requireEvidence: true,
        evidenceAsOf: "2026-07-19",
      }),
    ).toThrow(/missing evidence links: classification tree evidence-tree/);
    expect(
      classify(backed, {}, {
        executionDate: "2026-01-01",
        requireEvidence: true,
        evidenceAsOf: "2026-07-19",
      }).status,
    ).toBe("incomplete");
  });

  it("rejects structurally misleading chain claims before they enter the corpus", () => {
    const raw = JSON.parse(JSON.stringify(evidenceCitation())) as {
      evidence: { amendment_chain: { source_ids: string[] } };
    };
    raw.evidence.amendment_chain.source_ids = ["unrelated-source"];
    expect(CitationSchema.safeParse(raw).success).toBe(false);
  });
});
