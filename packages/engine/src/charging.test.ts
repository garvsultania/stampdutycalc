import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import {
  compareS5S6,
  computeS4,
  computeS5,
  computeS6,
  loadStateDir,
  mergeLoads,
  resolveChargingRules,
  EngineError,
  type NamedInstrument,
} from "./index.js";

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const corpus = mergeLoads([
  loadStateDir(root("../../../rules/DL")),
  loadStateDir(root("../../../rules/MH")),
  loadStateDir(root("../../../rules/KA")),
]);
const rs = corpus.ruleSet;
const DATE = "2024-06-01";

const dlCharging = resolveChargingRules(rs, "DL", DATE);
const mhCharging = resolveChargingRules(rs, "MH", DATE);
const kaCharging = resolveChargingRules(rs, "KA", DATE);

/** A Delhi sale set: the conveyance (the real duty) + two ancillary instruments. */
const dlSaleSet: NamedInstrument[] = [
  {
    label: "Sale deed",
    input: {
      jurisdiction: "DL", rule_id: "DL-ART23-conveyance", execution_date: DATE,
      values: { consideration: "10000000", market_value: "10000000" },
      facts: { transferee_category: "male" },
    },
  },
  {
    label: "General POA to the buyer",
    input: { jurisdiction: "DL", rule_id: "DL-ART48-gpa", execution_date: DATE, values: {}, facts: {} },
  },
  {
    label: "Affidavit of title",
    input: { jurisdiction: "DL", rule_id: "DL-ART4-affidavit", execution_date: DATE, values: {}, facts: {} },
  },
];

describe("s.4 — several instruments, one transaction (PRD §5.4)", () => {
  it("charges the principal in full and every other instrument the nominal duty", () => {
    const r = computeS4(rs, dlCharging, dlSaleSet, { transactionType: "sale" });
    // Conveyance 1cr male 2024 = 3% stamp + 4% transfer = 7,00,000. Others → Rs 1 each.
    expect(r.principal.label).toBe("Sale deed");
    expect(r.principal.charged).toBe("700000");
    expect(r.others.map((o) => o.charged)).toEqual(["1", "1"]);
    // Without s.4 the POA (Rs 50) and affidavit (Rs 10) would bear their own duty.
    expect(r.others.map((o) => o.own_duty_would_be)).toEqual(["50", "10"]);
    expect(r.total).toBe("700002");
    expect(r.principal_selection).toBe("highest_duty_default");
    expect(r.warnings).toEqual([]);
  });

  it("nominating a cheaper instrument does NOT reduce the duty (the s.4 proviso), and warns", () => {
    const r = computeS4(rs, dlCharging, dlSaleSet, { transactionType: "sale", principalIndex: 1 });
    expect(r.principal.label).toBe("General POA to the buyer");
    expect(r.principal.own_duty).toBe("50"); // what the POA alone would bear
    expect(r.principal.charged).toBe("700000"); // but it is charged the HIGHEST duty
    expect(r.total).toBe("700002"); // identical total — the nomination buys nothing
    expect(r.warnings[0]).toMatch(/charged the HIGHEST duty/);
  });

  it("state nominal duties differ sharply (DL Rs 1 · KA Rs 100 · MH Rs 500)", () => {
    expect(dlCharging.s4.nominal_duty).toBe("1");
    expect(kaCharging.s4.nominal_duty).toBe("100");
    expect(mhCharging.s4.nominal_duty).toBe("500");
  });

  it("ESCALATES where the state's s.4 does not reach the transaction type", () => {
    // Maharashtra's s.4 covers leases; Delhi's does not.
    expect(() => computeS4(rs, mhCharging, dlSaleSet, { transactionType: "lease" })).not.toThrow();
    expect(() => computeS4(rs, dlCharging, dlSaleSet, { transactionType: "lease" })).toThrow(
      /does not extend to "lease"/,
    );
    expect(() => computeS4(rs, kaCharging, dlSaleSet, { transactionType: "development_agreement" })).toThrow(
      /does not extend to "development_agreement"/,
    );
  });

  it("refuses a single-instrument s.4 request", () => {
    expect(() => computeS4(rs, dlCharging, [dlSaleSet[0]!], { transactionType: "sale" })).toThrow(EngineError);
  });
});

describe("s.5 vs s.6 — aggregate vs highest (PRD §5.4)", () => {
  // The classic Maharashtra grey zone: is it a lease (Art 36) or a leave & licence
  // (Art 36A)? The trees escalate it; s.6 says charge the higher of the two.
  const mhCompeting: NamedInstrument[] = [
    {
      label: "As a lease (Art 36)",
      input: {
        jurisdiction: "MH", rule_id: "MH-ART36-lease", execution_date: DATE,
        values: { market_value: "10000000", term_months: "72" },
        facts: { area_type: "municipal_corporation" },
      },
    },
    {
      label: "As a leave & licence (Art 36A)",
      input: {
        jurisdiction: "MH", rule_id: "MH-ART36A-leave-license", execution_date: DATE,
        values: { term_months: "24", licence_fee_total: "1200000", non_refundable_deposit: "0", refundable_deposit: "500000" },
        facts: {},
      },
    },
  ];

  it("s.6 charges the highest of the competing descriptions and marks which one bites", () => {
    const r = computeS6(rs, mhCompeting);
    // Lease: 25% of 1cr = 25L × 5% = 1,25,000. L&L: 0.25% of 12.5L = 3,125.
    expect(r.total).toBe("125000");
    expect(r.descriptions.map((d) => d.chargeable)).toEqual([true, false]);
    expect(r.tied).toBe(false);
  });

  it("s.5 aggregates instead — and the gap between the two is the stake", () => {
    const r = computeS5(rs, mhCompeting);
    expect(r.total).toBe("128125"); // 1,25,000 + 3,125

    const cmp = compareS5S6(rs, mhCompeting);
    expect(cmp.s6.total).toBe("125000");
    expect(cmp.difference).toBe("3125"); // what construction is worth here
    expect(cmp.guidance).toMatch(/question of construction/);
  });

  it("flags a tie, where s.6 changes nothing", () => {
    const tie: NamedInstrument[] = [
      { label: "Works contract", input: { jurisdiction: "KA", rule_id: "KA-ART5j-works-contract", execution_date: DATE, values: {}, facts: {} } },
      { label: "Service agreement", input: { jurisdiction: "KA", rule_id: "KA-ART5j-service-agreement", execution_date: DATE, values: {}, facts: {} } },
    ];
    const r = computeS6(rs, tie);
    expect(r.total).toBe("200");
    expect(r.tied).toBe(true);
    expect(r.warnings[0]).toMatch(/same duty/);
  });

  it("the Maharashtra works-vs-service fork under s.6 charges the works rate", () => {
    const mhFork: NamedInstrument[] = [
      { label: "Works contract (Art 63)", input: { jurisdiction: "MH", rule_id: "MH-ART63-works-contract", execution_date: DATE, values: { contract_value: "50000000" }, facts: {} } },
      { label: "Service agreement (Art 5(h)(B))", input: { jurisdiction: "MH", rule_id: "MH-ART5hB-service-agreement", execution_date: DATE, values: {}, facts: {} } },
    ];
    const r = computeS6(rs, mhFork);
    expect(r.total).toBe("49500"); // not Rs 100 — s.6 resolves the ~495x fork conservatively
    expect(r.descriptions[0]!.chargeable).toBe(true);
  });
});

describe("charging rules are part of the ruleset identity", () => {
  it("every state has s.4/s.5/s.6 encoded with citations", () => {
    for (const c of [dlCharging, mhCharging, kaCharging]) {
      expect(c.s4.source.quoted_text.length).toBeGreaterThan(50);
      expect(c.s5.source.quoted_text.length).toBeGreaterThan(50);
      expect(c.s6.source.quoted_text.length).toBeGreaterThan(50);
    }
  });
});
