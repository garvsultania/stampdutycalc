import { describe, it, expect } from "vitest";
import type { Modifier, Rule } from "@stampdraft/schema";
import { collectPending, assertFactsPresent } from "./pending.js";
import { EngineError } from "./errors.js";

const version = {
  effective_from: "2020-01-01",
  effective_to: null,
  supersedes: null,
  source: { type: "act" as const, ref: "Test Act s.1", quoted_text: "test" },
  verified_by: null,
  verified_on: null,
};

const rule = (pending: Rule["pending_verification"]): Rule =>
  ({
    rule_id: "T-1",
    jurisdiction: "DL",
    act: "Test",
    article: "1",
    instrument: "conveyance_sale_deed",
    version,
    charge: { type: "fixed", amount: 100 },
    modifiers: [],
    rounding: { mode: "none" },
    pending_verification: pending,
    notes_for_reviewer: "",
  }) as unknown as Rule;

const modifier = (over: Partial<Modifier>): Modifier =>
  ({
    modifier_id: "M-1",
    jurisdiction: "DL",
    kind: "surcharge_cess",
    applies_when: { always: true },
    effect: { op: "flat_add", amount: 10, label: "test" },
    order: 1,
    version,
    requires_facts: [],
    pending_verification: [],
    notes_for_reviewer: "",
    ...over,
  }) as unknown as Modifier;

describe("pending verification flags", () => {
  it("refuses by default when an unscoped flag is present", () => {
    const flags = collectPending([rule([{ reason: "whole rule unsourced" }])], [], {}, "2024-01-01", {});
    expect(flags.refuse).toHaveLength(1);
    expect(flags.refuse[0]).toContain("whole rule unsourced");
    expect(flags.warn).toHaveLength(0);
  });

  it("warns instead of refusing only when explicitly opted down", () => {
    const flags = collectPending(
      [rule([{ reason: "who pays is contested", severity: "warn" }])],
      [],
      {},
      "2024-01-01",
      {},
    );
    expect(flags.refuse).toHaveLength(0);
    expect(flags.warn[0]).toContain("who pays is contested");
  });

  it("scopes a flag to the doubtful cell — other inputs are unaffected", () => {
    const r = rule([{ reason: "joint split unsourced", when: { eq: { field: "cat", value: "joint" } } }]);
    expect(collectPending([r], [], { cat: "female" }, "2024-01-01", {}).refuse).toHaveLength(0);
    expect(collectPending([r], [], { cat: "joint" }, "2024-01-01", {}).refuse).toHaveLength(1);
  });

  it("collects flags from applied modifiers, not just the rule", () => {
    const mod = modifier({ pending_verification: [{ reason: "cess area list unsourced" }] });
    const flags = collectPending([rule([])], [mod], {}, "2024-01-01", {});
    expect(flags.refuse[0]).toContain("cess area list unsourced");
    expect(flags.refuse[0]).toContain("M-1");
  });

  it("escalates when a fact the modifier depends on was never supplied", () => {
    const mod = modifier({ requires_facts: ["metro_cess_city"] });
    expect(() => assertFactsPresent(mod, {})).toThrow(EngineError);
    expect(() => assertFactsPresent(mod, {})).toThrow(/metro_cess_city/);
  });

  it("does not escalate once the fact is supplied — including when it is 'no'", () => {
    const mod = modifier({ requires_facts: ["metro_cess_city"] });
    expect(() => assertFactsPresent(mod, { metro_cess_city: "no" })).not.toThrow();
  });
});
