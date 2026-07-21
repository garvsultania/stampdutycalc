import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import type { ClassificationTree } from "@stampdraft/schema";
import { classify, compute, loadStateDir, mergeLoads, resolveClassificationTree } from "./index.js";
import {
  CORPUS_CONTROL_COVERAGE,
  CORPUS_DOUBT_PATTERN,
  CORPUS_SAFETY_INVENTORY,
} from "./corpus-safety-inventory.js";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const corpus = mergeLoads([
  loadStateDir(root("../../../rules/DL")),
  loadStateDir(root("../../../rules/MH")),
  loadStateDir(root("../../../rules/KA")),
]);

function tree(id: string): ClassificationTree {
  const found = corpus.trees.find((candidate) => candidate.tree_id === id);
  if (!found) throw new Error(`missing classification tree ${id}`);
  return found;
}

type CorpusObject = Record<string, unknown> & {
  version: { effective_from: string };
  pending_verification?: Array<{ severity?: "refuse" | "warn" }>;
};

function corpusObjects(): Array<{ kind: string; id: string; object: CorpusObject }> {
  return [
    ...corpus.ruleSet.rules.map((object) => ({ kind: "rule", id: object.rule_id, object })),
    ...corpus.ruleSet.modifiers.map((object) => ({ kind: "modifier", id: object.modifier_id, object })),
    ...corpus.ruleSet.penaltyRegimes.map((object) => ({ kind: "penalty", id: object.regime_id, object })),
    ...(corpus.ruleSet.chargingRules ?? []).map((object) => ({ kind: "charging", id: object.rules_id, object })),
    ...corpus.trees.map((object) => ({ kind: "tree", id: object.tree_id, object })),
  ];
}

function objectKey(kind: string, id: string, object: CorpusObject): string {
  return `${kind}:${id}@${object.version.effective_from}`;
}

function collectDoubtFields(value: unknown, path = ""): string[] {
  if (typeof value === "string") return CORPUS_DOUBT_PATTERN.test(value) ? [path] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectDoubtFields(item, `${path}[${index}]`));
  }
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => {
    // Machine-readable controls are the disposition, not another prose candidate.
    if (key === "pending_verification" || key === "input_contract") return [];
    return collectDoubtFields(item, path ? `${path}.${key}` : key);
  });
}

function pendingControls(): Map<string, "refuse" | "warn"> {
  const controls = new Map<string, "refuse" | "warn">();
  for (const { kind, id, object } of corpusObjects()) {
    const base = objectKey(kind, id, object);
    object.pending_verification?.forEach((pending, index) => {
      controls.set(`${base}:pending_verification[${index}]`, pending.severity ?? "refuse");
    });
    if (kind === "charging") {
      for (const section of ["s4", "s5", "s6"] as const) {
        const pending = (object[section] as {
          pending_verification?: Array<{ severity?: "refuse" | "warn" }>;
        }).pending_verification ?? [];
        pending.forEach((item, index) => {
          controls.set(`${base}:${section}.pending_verification[${index}]`, item.severity ?? "refuse");
        });
      }
    }
  }
  return controls;
}

describe("deterministic corpus safety inventory", () => {
  it("dispositions every uncertainty-language field by stable object/version/field key", () => {
    const candidates = corpusObjects().flatMap(({ kind, id, object }) => {
      const base = objectKey(kind, id, object);
      return collectDoubtFields(object).map((field) => `${base}:${field}`);
    });
    const inventoried = CORPUS_SAFETY_INVENTORY.map((item) => item.key);

    expect(new Set(candidates).size).toBe(candidates.length);
    expect(new Set(inventoried).size).toBe(inventoried.length);
    expect([...inventoried].sort()).toEqual([...candidates].sort());
  });

  it("requires every amount-affecting disposition to resolve to the declared machine control", () => {
    const controls = pendingControls();
    for (const entry of CORPUS_SAFETY_INVENTORY) {
      expect(entry.dispositions.length, entry.key).toBeGreaterThan(0);
      for (const disposition of entry.dispositions) {
        if (disposition.kind === "non_amount_affecting") {
          expect(disposition.reason.length, entry.key).toBeGreaterThan(20);
          continue;
        }
        expect(disposition.controls.length, entry.key).toBeGreaterThan(0);
        for (const control of disposition.controls) {
          expect(controls.has(control), `${entry.key} -> ${control}`).toBe(true);
          const expected = disposition.kind === "pending_warning" ? "warn" : "refuse";
          expect(controls.get(control), `${entry.key} -> ${control}`).toBe(expected);
        }
      }
    }
  });

  it("requires an exact coverage disposition for every pending control in the corpus", () => {
    const controls = pendingControls();
    const covered = CORPUS_CONTROL_COVERAGE.map((entry) => entry.control);
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual([...controls.keys()].sort());

    for (const entry of CORPUS_CONTROL_COVERAGE) {
      expect(entry.coverage.length, entry.control).toBeGreaterThan(20);
      expect(controls.get(entry.control), entry.control).toBe(entry.severity);
    }
  });
});

describe("corpus classification refusal gates", () => {
  it("allows the Delhi lease branch but refuses the unproved leave-and-licence terminal", () => {
    const leaseTree = tree("DL-lease-vs-leave-license");
    expect(
      classify(
        leaseTree,
        { q_exclusive_possession: "yes", q_interest: "yes" },
        { executionDate: "2024-06-01" },
      ),
    ).toMatchObject({ status: "resolved", rule_id: "DL-ART35-lease" });

    expect(() =>
      classify(
        leaseTree,
        { q_exclusive_possession: "no", q_indicia: "no" },
        { executionDate: "2024-06-01" },
      ),
    ).toThrow(/operative stamp treatment has not been established/);
  });

  it("refuses both unproved Delhi works/service residual terminals", () => {
    const worksTree = tree("DL-works-vs-service");
    expect(() =>
      classify(
        worksTree,
        { q_goods_transfer: "yes", q_deliverable: "yes" },
        { executionDate: "2024-06-01" },
      ),
    ).toThrow(/Complete current notification history/);
    expect(() =>
      classify(worksTree, { q_goods_transfer: "no" }, { executionDate: "2024-06-01" }),
    ).toThrow(/excluding more specific/);
  });

  it("selects both Maharashtra works/service eras at the amendment boundary", () => {
    const answers = { q_goods_transfer: "yes", q_additional_transaction_works: "no" };
    const historical = resolveClassificationTree(corpus.trees, "MH-works-vs-service", "2024-10-13");
    const current = resolveClassificationTree(corpus.trees, "MH-works-vs-service", "2024-10-14");
    expect(classify(historical, answers, { executionDate: "2024-10-13" })).toMatchObject({
      status: "resolved",
      rule_id: "MH-ART63-works-contract",
    });
    expect(classify(current, answers, { executionDate: "2024-10-14" })).toMatchObject({
      status: "resolved",
      rule_id: "MH-ART63-works-contract",
    });
  });

  it("derives the Maharashtra service terminal from observable tree answers", () => {
    const worksTree = tree("MH-works-vs-service");
    expect(classify(worksTree, {
      q_goods_transfer: "no",
      q_additional_transaction_service: "no",
    }, { executionDate: "2024-06-01" })).toMatchObject({
      status: "resolved",
      rule_id: "MH-ART5hB-service-agreement",
    });
    expect(classify(worksTree, {
      q_goods_transfer: "uncertain",
    }, { executionDate: "2024-06-01" })).toMatchObject({ status: "escalate" });
  });
});

describe("first high-risk inventory family: Delhi joint transfer duty", () => {
  const sale = (execution_date: string, value: string, transferee_category?: string) => ({
    jurisdiction: "DL" as const,
    rule_id: "DL-ART23-conveyance",
    execution_date,
    values: { consideration: value, market_value: value },
    facts: transferee_category === undefined ? {} : { transferee_category },
  });

  it("preserves the verified pre-hike joint total but machine-warns on both provisional components", () => {
    const result = compute(corpus.ruleSet, sale("2023-07-09", "10000000", "joint"));
    expect(result.total_duty).toBe("500000");
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join(" ")).toMatch(/component split.*component/i);
  });

  it("warns at the unchanged-rate threshold and refuses the neighbouring post-hike joint cell", () => {
    const boundary = compute(corpus.ruleSet, sale("2023-07-10", "2500000", "joint"));
    expect(boundary.total_duty).toBe("125000");
    expect(boundary.warnings).toHaveLength(2);

    expect(() => compute(corpus.ruleSet, sale("2023-07-10", "2500001", "joint"))).toThrow(
      /JOINT male\+female purchase above Rs 25L/,
    );
  });

  it("keeps a current neighbouring sourced cell callable and refuses a missing category", () => {
    expect(compute(corpus.ruleSet, sale("2026-07-21", "10000000", "male"))).toMatchObject({
      total_duty: "700000",
      warnings: [],
    });
    expect(() => compute(corpus.ruleSet, sale("2026-07-21", "10000000"))).toThrow(
      /transferee_category/,
    );
  });
});

describe("newly inventoried Karnataka surcharge refusals", () => {
  it("refuses the secondary-only local surcharge instead of returning a conveyance total", () => {
    expect(() => compute(corpus.ruleSet, {
      jurisdiction: "KA",
      rule_id: "KA-ART20-conveyance",
      execution_date: "2026-07-21",
      values: { market_value: "10000000" },
      facts: { first_sale_flat: "no", ka_area: "urban" },
    })).toThrow(/local-body surcharge rate/);
  });

  it("refuses both family and non-family gifts until cess and local scope are sourced", () => {
    const gift = (gift_relation_ka: string, area_type: string) => () => compute(corpus.ruleSet, {
      jurisdiction: "KA",
      rule_id: "KA-ART28-gift",
      execution_date: "2026-07-21",
      values: { market_value: "5000000" },
      facts: { gift_relation_ka, area_type },
    });
    expect(gift("family", "bbmp_bmrda_city_corp")).toThrow(/unresolved surcharge scope/);
    expect(gift("other", "rural")).toThrow(/unresolved surcharge scope/);
  });

  it("refuses current bare-conveyance and lease paths until the annual Act graph is complete", () => {
    expect(() => compute(corpus.ruleSet, {
      jurisdiction: "KA",
      rule_id: "KA-ART20-rate",
      execution_date: "2026-07-21",
      values: { market_value: "10000000" },
      facts: { ka_area: "urban" },
    })).toThrow(/accepted Karnataka source spine ends/);
    expect(() => compute(corpus.ruleSet, {
      jurisdiction: "KA",
      rule_id: "KA-ART30-lease",
      execution_date: "2026-07-21",
      values: {
        term_months: "12",
        avg_annual_rent: "240000",
        premium: "0",
        fine: "0",
        money_advanced: "0",
      },
      facts: { property_use: "residential" },
    })).toThrow(/annual Act and commencement graph/);
  });
});

describe("Delhi mortgage and agreement-to-sell refusal boundaries", () => {
  const mortgage = (execution_date: string, amount_secured?: string) => ({
    jurisdiction: "DL" as const,
    rule_id: "DL-ART40a-mortgage-with-possession",
    execution_date,
    values: amount_secured === undefined ? {} : { amount_secured },
    facts: {},
  });

  const ats = (
    execution_date: string,
    consideration?: string,
    transferee_category?: string,
  ) => ({
    jurisdiction: "DL" as const,
    rule_id: "DL-ART23A-ats-part-performance",
    execution_date,
    values: consideration === undefined ? {} : { consideration },
    facts: transferee_category === undefined ? {} : { transferee_category },
  });

  it("refuses mortgage totals immediately before, on, and well after the municipal amendment", () => {
    for (const [date, amount] of [
      ["2023-07-09", "5000000"],
      ["2023-07-10", "2500000"],
      ["2026-07-21", "5000000"],
    ] as const) {
      expect(() => compute(corpus.ruleSet, mortgage(date, amount))).toThrow(
        /DMC transfer-duty base, gender treatment/,
      );
    }
  });

  it("keeps mortgage arithmetic deterministic across the amendment while eligibility remains closed", () => {
    expect(compute(corpus.ruleSet, mortgage("2023-07-10", "2500000"), {
      pendingPolicy: "arithmetic-test-only",
    }).total_duty).toBe("150000");
    expect(compute(corpus.ruleSet, mortgage("2023-07-10", "3000000"), {
      pendingPolicy: "arithmetic-test-only",
    }).total_duty).toBe("210000");
  });

  it("rejects a missing mortgage base before reaching the legal refusal", () => {
    expect(() => compute(corpus.ruleSet, mortgage("2026-07-21"))).toThrow(/amount_secured/);
  });

  it("keeps the neighbouring principal mortgage-without-possession cell callable and refuses collateral scope", () => {
    const principal = {
      jurisdiction: "DL" as const,
      rule_id: "DL-ART40b-mortgage-without-possession",
      execution_date: "2026-07-21",
      values: { amount_secured: "5000000" },
      facts: { is_collateral_or_auxiliary_security: "no" },
    };
    expect(compute(corpus.ruleSet, principal).total_duty).toBe("100000");
    expect(() => compute(corpus.ruleSet, {
      ...principal,
      facts: { is_collateral_or_auxiliary_security: "yes" },
    })).toThrow(/Collateral or auxiliary security/);
  });

  it("refuses ATS totals across the amendment and the ambiguous 90%-base threshold window", () => {
    for (const [date, consideration] of [
      ["2023-07-09", "5000000"],
      ["2023-07-10", "2600000"],
      ["2026-07-21", "5000000"],
    ] as const) {
      expect(() => compute(corpus.ruleSet, ats(date, consideration, "male"))).toThrow(
        /municipal transfer-duty scope, 90% base, post-2023 threshold test/,
      );
    }
  });

  it("pins the encoded ATS threshold arithmetic without treating it as legally supported", () => {
    expect(compute(corpus.ruleSet, ats("2023-07-10", "2500000", "male"), {
      pendingPolicy: "arithmetic-test-only",
    }).total_duty).toBe("135000");
    expect(compute(corpus.ruleSet, ats("2023-07-10", "2600000", "male"), {
      pendingPolicy: "arithmetic-test-only",
    }).total_duty).toBe("163800");
  });

  it("rejects missing ATS amount/category inputs and keeps the no-possession neighbour closed", () => {
    expect(() => compute(corpus.ruleSet, ats("2026-07-21", undefined, "male"))).toThrow(
      /consideration/,
    );
    expect(() => compute(corpus.ruleSet, ats("2026-07-21", "5000000"))).toThrow(
      /transferee_category/,
    );
    expect(() => compute(corpus.ruleSet, {
      jurisdiction: "DL",
      rule_id: "DL-ART5c-agreement-to-sell",
      execution_date: "2026-07-21",
      values: {},
      facts: {},
    })).toThrow(/supported observable fact pattern/);
  });
});

describe("Delhi partnership and LLP refusal boundaries", () => {
  const partnership = (capital?: string) => ({
    jurisdiction: "DL" as const,
    rule_id: "DL-ART46-partnership",
    execution_date: "2026-07-21",
    values: capital === undefined ? {} : { capital },
    facts: {},
  });

  it("refuses the unresolved Rs 500 cell but permits the neighbouring Article 46(A)(b) formula", () => {
    expect(() => compute(corpus.ruleSet, partnership("500"))).toThrow(
      /capital does not exceed Rs 500/,
    );
    expect(compute(corpus.ruleSet, partnership("501")).total_duty).toBe("5.01");
  });

  it("rejects missing capital and refuses LLP classification independently of contribution size", () => {
    expect(() => compute(corpus.ruleSet, partnership())).toThrow(/capital/);
    for (const capital of ["500", "1000000"]) {
      expect(() => compute(corpus.ruleSet, {
        jurisdiction: "DL",
        rule_id: "DL-llp-agreement",
        execution_date: "2026-07-21",
        values: { capital },
        facts: {},
      })).toThrow(/Treating an LLP agreement as a partnership instrument/);
    }
  });

  it("keeps the neighbouring dissolution instrument distinct and callable", () => {
    expect(compute(corpus.ruleSet, {
      jurisdiction: "DL",
      rule_id: "DL-ART46B-partnership-dissolution",
      execution_date: "2026-07-21",
      values: {},
      facts: {},
    }).total_duty).toBe("200");
  });
});

describe("Maharashtra surcharge and locality refusal boundaries", () => {
  const conveyance = (
    execution_date: string,
    facts: Record<string, string | number>,
  ) => ({
    jurisdiction: "MH" as const,
    rule_id: "MH-ART25-conveyance",
    execution_date,
    values: { market_value: "10000000" },
    facts,
  });

  const nonMetroFacts = {
    area_type: "municipal_corporation",
    metro_cess_city: "no",
    lbt_status: "not_applicable",
    mh_section9_remission_claim: "none_identified",
    mh_gcc_remission_scope: "not_applicable",
  };

  it("closes the first active metro-surcharge era at both boundaries", () => {
    expect(compute(corpus.ruleSet, conveyance("2019-02-07", {
      ...nonMetroFacts,
      metro_cess_city: "yes",
    })).total_duty).toBe("500000");
    expect(() => compute(corpus.ruleSet, conveyance("2019-02-08", {
      ...nonMetroFacts,
      metro_cess_city: "yes",
    }))).toThrow(/active from 8-Feb-2019 through 31-Mar-2020/);
    expect(() => compute(corpus.ruleSet, conveyance("2020-03-31", {
      ...nonMetroFacts,
      metro_cess_city: "yes",
    }))).toThrow(/active from 8-Feb-2019 through 31-Mar-2020/);
    expect(compute(corpus.ruleSet, conveyance("2020-04-01", {
      ...nonMetroFacts,
      metro_cess_city: "yes",
    })).total_duty).toBe("500000");
  });

  it("preserves the suspension through 31-Mar-2022 and refuses from revival day", () => {
    expect(compute(corpus.ruleSet, conveyance("2022-03-31", {
      ...nonMetroFacts,
      metro_cess_city: "yes",
    })).total_duty).toBe("500000");
    expect(() => compute(corpus.ruleSet, conveyance("2022-04-01", {
      ...nonMetroFacts,
      metro_cess_city: "yes",
    }))).toThrow(/CITY LIST, INSTRUMENT SCOPE, AND STACKING/);
  });

  it("keeps a current non-metro/non-LBT cell callable and refuses either unresolved levy", () => {
    expect(compute(corpus.ruleSet, conveyance("2026-07-21", nonMetroFacts)).total_duty).toBe(
      "500000",
    );
    expect(() => compute(corpus.ruleSet, conveyance("2026-07-21", {
      ...nonMetroFacts,
      metro_cess_city: "yes",
    }))).toThrow(/CITY LIST, INSTRUMENT SCOPE, AND STACKING/);
    expect(() => compute(corpus.ruleSet, conveyance("2026-07-21", {
      ...nonMetroFacts,
      lbt_status: "applies_or_uncertain",
    }))).toThrow(/Local Body Tax or another omitted local surcharge/);
    expect(() => compute(corpus.ruleSet, conveyance("2026-07-21", {
      ...nonMetroFacts,
      mh_gcc_remission_scope: "eligible_or_uncertain",
    }))).toThrow(/GCC Policy 2025 order can remit/);
    expect(() => compute(corpus.ruleSet, conveyance("2026-07-21", {
      ...nonMetroFacts,
      mh_section9_remission_claim: "claimed_or_uncertain",
    }))).toThrow(/instrument-, party-, project-, policy-, and period-specific/);
  });

  it("rejects missing conveyance locality facts before charge evaluation", () => {
    for (const missing of [
      "area_type",
      "metro_cess_city",
      "lbt_status",
      "mh_section9_remission_claim",
      "mh_gcc_remission_scope",
    ] as const) {
      const facts = { ...nonMetroFacts };
      delete facts[missing];
      expect(() => compute(corpus.ruleSet, conveyance("2026-07-21", facts))).toThrow(
        new RegExp(missing),
      );
    }
  });
});

describe("Maharashtra gift and mortgage locality branches", () => {
  const gift = (
    gift_relation: string,
    overrides: Record<string, string | number> = {},
  ) => ({
    jurisdiction: "MH" as const,
    rule_id: "MH-ART34-gift",
    execution_date: "2026-07-21",
    values: { market_value: "5000000" },
    facts: {
      area_type: "municipal_corporation",
      gift_relation,
      metro_cess_city: "no",
      lbt_status: "not_applicable",
      ...overrides,
    },
  });

  it("keeps all three current gift relation branches callable only outside omitted levies", () => {
    expect(compute(corpus.ruleSet, gift("close_family_residential_agri")).total_duty).toBe("200");
    expect(compute(corpus.ruleSet, gift("family")).total_duty).toBe("150000");
    expect(compute(corpus.ruleSet, gift("other")).total_duty).toBe("250000");
  });

  it("refuses metro and LBT-uncertain gifts regardless of the favourable family branch", () => {
    for (const relation of ["close_family_residential_agri", "family", "other"]) {
      expect(() => compute(corpus.ruleSet, gift(relation, { metro_cess_city: "yes" }))).toThrow(
        /active metro\/transport surcharge applies to gifts/,
      );
      expect(() => compute(corpus.ruleSet, gift(relation, {
        lbt_status: "applies_or_uncertain",
      }))).toThrow(/Gift totals currently omit Local Body Tax/);
    }
  });

  it("rejects missing gift relation and locality facts", () => {
    for (const missing of ["gift_relation", "metro_cess_city", "lbt_status"] as const) {
      const input = gift("family");
      delete input.facts[missing];
      expect(() => compute(corpus.ruleSet, input)).toThrow(new RegExp(missing));
    }
  });

  const mortgage = (overrides: Record<string, string | number> = {}) => ({
    jurisdiction: "MH" as const,
    rule_id: "MH-ART40a-mortgage-with-possession",
    execution_date: "2026-07-21",
    values: { amount_secured: "5000000" },
    facts: {
      area_type: "municipal_corporation",
      mortgage_subtype: "non_usufructuary",
      metro_cess_city: "no",
      lbt_status: "not_applicable",
      mh_section9_remission_claim: "none_identified",
      mh_gcc_remission_scope: "not_applicable",
      mh_agricultural_loan_remission_scope: "not_applicable",
      ...overrides,
    },
  });

  it("keeps only the current non-usufructuary, non-metro, non-LBT mortgage cell callable", () => {
    expect(compute(corpus.ruleSet, mortgage()).total_duty).toBe("250000");
    expect(() => compute(corpus.ruleSet, mortgage({
      mortgage_subtype: "usufructuary_or_uncertain",
    }))).toThrow(/transport surcharge reaches usufructuary mortgages/);
    expect(() => compute(corpus.ruleSet, mortgage({ metro_cess_city: "yes" }))).toThrow(
      /transport surcharge reaches usufructuary mortgages/,
    );
    expect(() => compute(corpus.ruleSet, mortgage({
      lbt_status: "applies_or_uncertain",
    }))).toThrow(/Local Body Tax or another omitted local surcharge/);
    expect(() => compute(corpus.ruleSet, mortgage({
      mh_agricultural_loan_remission_scope: "eligible_or_uncertain",
    }))).toThrow(/remits the whole stamp duty/);
  });

  it("rejects missing mortgage subtype and locality facts", () => {
    for (const missing of [
      "area_type",
      "mortgage_subtype",
      "metro_cess_city",
      "lbt_status",
      "mh_section9_remission_claim",
      "mh_gcc_remission_scope",
      "mh_agricultural_loan_remission_scope",
    ] as const) {
      const input = mortgage();
      delete input.facts[missing];
      expect(() => compute(corpus.ruleSet, input)).toThrow(new RegExp(missing));
    }
  });
});
