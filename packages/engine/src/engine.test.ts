import { describe, it, expect } from "vitest";
import {
  ClassificationTreeSchema,
  RuleSchema,
  type Rule,
  type ClassificationTree,
} from "@stampdraft/schema";
import {
  buildSnapshot,
  classify,
  compute,
  computePenalty,
  EngineError,
  num,
  canonical,
  applyRounding,
  validateRuleSet,
  type RuleSet,
} from "./index.js";

function makeRule(over: Partial<Rule> & Pick<Rule, "rule_id" | "charge">): Rule {
  return RuleSchema.parse({
    jurisdiction: "DL",
    act: "Test Act",
    article: "T",
    instrument: "conveyance_sale_deed",
    version: {
      effective_from: "2015-01-01",
      effective_to: null,
      source: { type: "act", ref: "T", quoted_text: "test" },
    },
    rounding: { mode: "none", nearest: 1 },
    ...over,
  });
}

describe("determinism & rules_version hash (PRD §7)", () => {
  const ruleSet: RuleSet = {
    rules: [makeRule({ rule_id: "R", charge: { kind: "ad_valorem", base: { var: "consideration" }, pct: 5 } })],
    modifiers: [],
    penaltyRegimes: [],
  };
  const input = {
    jurisdiction: "DL" as const,
    rule_id: "R",
    execution_date: "2021-01-01",
    values: { consideration: "1000000" },
    facts: {},
  };

  it("produces byte-for-byte identical output across runs", () => {
    const a = JSON.stringify(compute(ruleSet, input));
    const b = JSON.stringify(compute(ruleSet, input));
    expect(a).toBe(b);
  });

  it("records a rules_version hash on the output", () => {
    const out = compute(ruleSet, input);
    expect(out.rules_version).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("identical active law on two dates ⇒ identical hash", () => {
    const h1 = buildSnapshot(ruleSet, "DL", "2021-01-01").hash;
    const h2 = buildSnapshot(ruleSet, "DL", "2021-06-01").hash;
    expect(h1).toBe(h2);
  });
});

describe("temporal & snapshot-scoped cross-refs (PRD §5.3, §5.4)", () => {
  const conveyanceV1 = makeRule({
    rule_id: "CONV",
    charge: { kind: "ad_valorem", base: { var: "consideration" }, pct: 5 },
    version: {
      effective_from: "2015-01-01",
      effective_to: "2020-04-01",
      supersedes: null,
      source: { type: "act", ref: "v1", quoted_text: "5%" },
      verified_by: null,
      verified_on: null,
    },
  });
  const conveyanceV2 = makeRule({
    rule_id: "CONV",
    charge: { kind: "ad_valorem", base: { var: "consideration" }, pct: 6 },
    version: {
      effective_from: "2020-04-01",
      effective_to: null,
      supersedes: "v1",
      source: { type: "notification", ref: "v2", quoted_text: "6%" },
      verified_by: null,
      verified_on: null,
    },
  });
  const bond = makeRule({ rule_id: "BOND", charge: { kind: "cross_ref", rule_id: "CONV" } });
  const ruleSet: RuleSet = { rules: [conveyanceV1, conveyanceV2, bond], modifiers: [], penaltyRegimes: [] };

  const bondOn = (date: string) =>
    compute(ruleSet, { jurisdiction: "DL", rule_id: "BOND", execution_date: date, values: { consideration: "1000000" }, facts: {} });

  it("cross-ref resolves to the version active on the execution date", () => {
    expect(bondOn("2019-01-01").total_duty).toBe("50000");
    expect(bondOn("2021-01-01").total_duty).toBe("60000");
  });

  it("different active snapshots ⇒ different rules_version hashes", () => {
    expect(bondOn("2019-01-01").rules_version).not.toBe(bondOn("2021-01-01").rules_version);
  });
});

describe("cross-ref cycle detection (never loops silently)", () => {
  const a = makeRule({ rule_id: "A", charge: { kind: "cross_ref", rule_id: "B" } });
  const b = makeRule({ rule_id: "B", charge: { kind: "cross_ref", rule_id: "A" } });
  const ruleSet: RuleSet = { rules: [a, b], modifiers: [], penaltyRegimes: [] };

  it("throws EngineError on a cyclic cross-ref", () => {
    expect(() =>
      compute(ruleSet, { jurisdiction: "DL", rule_id: "A", execution_date: "2021-01-01", values: {}, facts: {} }),
    ).toThrow(EngineError);
  });
});

describe("missing cross-ref target within snapshot", () => {
  const bond = makeRule({ rule_id: "BOND", charge: { kind: "cross_ref", rule_id: "GHOST" } });
  const ruleSet: RuleSet = { rules: [bond], modifiers: [], penaltyRegimes: [] };
  it("throws rather than approximating", () => {
    expect(() =>
      compute(ruleSet, { jurisdiction: "DL", rule_id: "BOND", execution_date: "2021-01-01", values: {}, facts: {} }),
    ).toThrow(/not active in the DL snapshot/);
  });
});

describe("ruleset validator (append-only + references)", () => {
  it("flags overlapping versions of a rule_id", () => {
    const v1 = makeRule({
      rule_id: "X",
      charge: { kind: "fixed", amount: "100" },
      version: { effective_from: "2015-01-01", effective_to: "2021-01-01", supersedes: null, source: { type: "act", ref: "a", quoted_text: "x" }, verified_by: null, verified_on: null },
    });
    const v2 = makeRule({
      rule_id: "X",
      charge: { kind: "fixed", amount: "200" },
      version: { effective_from: "2020-06-01", effective_to: null, supersedes: null, source: { type: "act", ref: "b", quoted_text: "x" }, verified_by: null, verified_on: null },
    });
    const issues = validateRuleSet({ rules: [v1, v2], modifiers: [], penaltyRegimes: [] });
    expect(issues.some((i) => i.level === "error" && i.message.includes("overlap"))).toBe(true);
  });

  it("flags a cross-ref target absent from the referrer's snapshot", () => {
    const bond = makeRule({ rule_id: "BOND", charge: { kind: "cross_ref", rule_id: "GHOST" } });
    const issues = validateRuleSet({ rules: [bond], modifiers: [], penaltyRegimes: [] });
    expect(issues.some((i) => i.level === "error" && i.message.includes("cross_ref target"))).toBe(true);
  });

  it("flags a modifier referenced but never defined", () => {
    const r = makeRule({ rule_id: "R", charge: { kind: "fixed", amount: "100" }, modifiers: ["NOPE"] });
    const issues = validateRuleSet({ rules: [r], modifiers: [], penaltyRegimes: [] });
    expect(issues.some((i) => i.level === "error" && i.message.includes("never defined"))).toBe(true);
  });
});

describe("classification tree walk (Flow B, PRD §6.2)", () => {
  const tree: ClassificationTree = ClassificationTreeSchema.parse({
    tree_id: "lease-vs-license",
    jurisdiction: "DL",
    instrument_class: "lease_vs_leave_and_license",
    root: "q_possession",
    nodes: {
      q_possession: {
        type: "question",
        text: "Is exclusive possession transferred?",
        legal_test: "Associated Hotels test — exclusive possession indicates lease.",
        edges: [
          { answer: "yes", to: "t_lease" },
          { answer: "no", to: "q_exclusive" },
        ],
      },
      q_exclusive: {
        type: "question",
        text: "Does the licensee have exclusive-possession indicia despite the label?",
        legal_test: "Substance over form.",
        edges: [
          { answer: "yes", to: "grey" },
          { answer: "no", to: "t_license" },
        ],
      },
      t_lease: { type: "terminal", instrument: "lease", article: "35", rule_id: "DL-lease" },
      t_license: { type: "terminal", instrument: "leave_and_license", article: "36", rule_id: "DL-ll" },
      grey: { type: "escalate", reason: "Exclusive-possession indicia in a license — S.6 highest-duty grey zone." },
    },
    version: { effective_from: "2015-01-01", effective_to: null, source: { type: "act", ref: "t", quoted_text: "test" } },
  });

  it("resolves to a terminal Schedule entry", () => {
    const r = classify(tree, { q_possession: "yes" });
    expect(r).toMatchObject({ status: "resolved", instrument: "lease", rule_id: "DL-lease" });
  });

  it("escalates in a grey zone rather than guessing", () => {
    const r = classify(tree, { q_possession: "no", q_exclusive: "yes" });
    expect(r.status).toBe("escalate");
  });

  it("returns incomplete when an answer is missing", () => {
    const r = classify(tree, {});
    expect(r).toMatchObject({ status: "incomplete", node: "q_possession" });
  });

  it("treats an unmatched answer as an escalation", () => {
    const r = classify(tree, { q_possession: "maybe" });
    expect(r.status).toBe("escalate");
  });
});

describe("penalty edge cases (PRD §5.6)", () => {
  it("zero deficit ⇒ zero penalty, no range", () => {
    const regime = {
      regime_id: "P",
      jurisdiction: "DL" as const,
      penalty: { type: "discretionary_range" as const, min_multiple: 1, max_multiple: 10 },
      adjudication_path: "S.31",
      version: { effective_from: "2015-01-01", effective_to: null, supersedes: null, source: { type: "act" as const, ref: "p", quoted_text: "x" }, verified_by: null, verified_on: null },
      notes_for_reviewer: "",
    };
    const r = computePenalty(regime, { dutyThen: num("50000"), dutyPaid: num("50000") });
    expect(r.deficit).toBe("0");
    expect(r.penalty_range).toBeNull();
  });
});

describe("D9 extensions: switch, cross_ref scale, expr-based cess, cmp condition", () => {
  const conveyance = makeRule({
    rule_id: "CONV",
    charge: {
      kind: "ad_valorem",
      base: { fn: "max", args: [{ var: "consideration" }, { var: "market_value" }] },
      pct: { by: "transferee_category", cases: [{ when: "female", pct: 2 }], default: 3 },
    },
  });

  it("switch selects a sub-charge by numeric band and errors beyond all cases", () => {
    const lease = makeRule({
      rule_id: "LEASE",
      charge: {
        kind: "switch",
        on: { var: "term_months" },
        cases: [
          { upto: 60, charge: { kind: "fixed", amount: "100" } },
          { upto: 120, charge: { kind: "cross_ref", rule_id: "CONV", on: { var: "avg_annual_rent" } } },
        ],
      },
    });
    const rs: RuleSet = { rules: [lease, conveyance], modifiers: [], penaltyRegimes: [] };
    const at = (months: string) =>
      compute(rs, {
        jurisdiction: "DL",
        rule_id: "LEASE",
        execution_date: "2021-01-01",
        values: { term_months: months, avg_annual_rent: "600000", consideration: "0", market_value: "0" },
        facts: {},
      });
    expect(at("36").total_duty).toBe("100");
    expect(at("72").total_duty).toBe("18000"); // 3% of 6L via rebased cross-ref
    expect(() => at("1300")).toThrow(/matches no switch case/);
  });

  it("cross_ref scale computes a fraction of the target's duty (Art 23A: 90%)", () => {
    const ats = makeRule({
      rule_id: "ATS",
      charge: { kind: "cross_ref", rule_id: "CONV", on: { var: "consideration" }, scale: 0.9 },
    });
    const rs: RuleSet = { rules: [ats, conveyance], modifiers: [], penaltyRegimes: [] };
    const out = compute(rs, {
      jurisdiction: "DL",
      rule_id: "ATS",
      execution_date: "2021-01-01",
      values: { consideration: "5000000" },
      facts: {},
    });
    expect(out.total_duty).toBe("135000"); // 90% of 3% of 50L
  });

  it("category-selected rate resolves from facts (female 2%)", () => {
    const rs: RuleSet = { rules: [conveyance], modifiers: [], penaltyRegimes: [] };
    const out = compute(rs, {
      jurisdiction: "DL",
      rule_id: "CONV",
      execution_date: "2021-01-01",
      values: { consideration: "1000000", market_value: "1000000" },
      facts: { transferee_category: "female" },
    });
    expect(out.total_duty).toBe("20000");
  });

  it("cmp condition gates a modifier on a value threshold; pct_add uses an expr base and RateSpec", () => {
    const hikeModifier = {
      modifier_id: "TD-HIKE",
      jurisdiction: "DL" as const,
      kind: "surcharge_cess" as const,
      applies_when: {
        cmp: {
          expr: { fn: "max" as const, args: [{ var: "consideration" }, { var: "market_value" }] },
          op: "gt" as const,
          value: 2500000,
        },
      },
      effect: {
        op: "pct_add" as const,
        pct: { by: "transferee_category", cases: [{ when: "female", pct: 3 }], default: 4 },
        of: { fn: "max" as const, args: [{ var: "consideration" }, { var: "market_value" }] },
        label: "Transfer duty (DMC s.147)",
      },
      order: 20,
      version: {
        effective_from: "2015-01-01",
        effective_to: null,
        supersedes: null,
        source: { type: "notification" as const, ref: "TD", quoted_text: "test" },
        verified_by: null,
        verified_on: null,
      },
      notes_for_reviewer: "",
    };
    const rule = makeRule({ rule_id: "SALE", charge: conveyance.charge, modifiers: ["TD-HIKE"] });
    const rs: RuleSet = { rules: [rule], modifiers: [hikeModifier], penaltyRegimes: [] };
    const at = (consideration: string, facts: Record<string, string>) =>
      compute(rs, {
        jurisdiction: "DL",
        rule_id: "SALE",
        execution_date: "2024-01-01",
        values: { consideration, market_value: consideration },
        facts,
      });
    // Above threshold: stamp 3% + transfer 4% = 7%.
    expect(at("10000000", {}).total_duty).toBe("700000");
    // Female above threshold: 2% + 3% = 5%.
    expect(at("10000000", { transferee_category: "female" }).total_duty).toBe("500000");
    // At/below threshold: modifier inapplicable → stamp only.
    expect(at("2500000", {}).total_duty).toBe("75000");
  });
});

describe("money & rounding primitives", () => {
  it("rounds up to nearest 100 (ceil)", () => {
    expect(canonical(applyRounding(num("1250"), { mode: "ceil", nearest: 100 }))).toBe("1300");
  });
  it("rounds to nearest 500 (half-up)", () => {
    expect(canonical(applyRounding(num("1250"), { mode: "round", nearest: 500 }))).toBe("1500");
  });
  it("floors to nearest 100", () => {
    expect(canonical(applyRounding(num("1299"), { mode: "floor", nearest: 100 }))).toBe("1200");
  });
  it("no rounding leaves the value exact", () => {
    expect(canonical(applyRounding(num("1234.5"), { mode: "none", nearest: 1 }))).toBe("1234.5");
  });
});

describe("audit fields", () => {
  const ruleSet: RuleSet = {
    rules: [makeRule({ rule_id: "R", charge: { kind: "fixed", amount: "100" }, version: { effective_from: "2015-01-01", effective_to: null, supersedes: null, source: { type: "act", ref: "r", quoted_text: "x" }, verified_by: "founder", verified_on: "2026-07-01" } })],
    modifiers: [],
    penaltyRegimes: [],
  };
  it("passes through verified_as_of and echoes inputs, with no wall-clock timestamp", () => {
    const out = compute(ruleSet, { jurisdiction: "DL", rule_id: "R", execution_date: "2021-01-01", values: {}, facts: {} });
    expect(out.verified_as_of).toBe("2026-07-01");
    expect(out.inputs_echo.rule_id).toBe("R");
    expect((out as Record<string, unknown>).timestamp).toBeUndefined();
  });
});
