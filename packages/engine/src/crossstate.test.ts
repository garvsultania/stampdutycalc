import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { compute, computeInterStateDifferential, loadStateDir, mergeLoads } from "./index.js";

// Load the real Delhi + Maharashtra rulesets from the repo data.
const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const merged = mergeLoads([
  loadStateDir(root("../../../rules/DL")),
  loadStateDir(root("../../../rules/MH")),
]);

const allThree = mergeLoads([
  loadStateDir(root("../../../rules/DL")),
  loadStateDir(root("../../../rules/MH")),
  loadStateDir(root("../../../rules/KA")),
]);

/**
 * Share transfer is UNION law (Finance Act 2019 uniform regime, effective
 * 1-7-2020) and "no state deviation is permitted" — independently corroborated by
 * the fact that neither the MH (Art 59) nor the KA (Art 52) 'Transfer' article has
 * a shares clause. That makes cross-state equality a real legal invariant, not a
 * coincidence of encoding — so it is worth pinning in a test.
 */
describe("share transfer is uniform across states (Union law, from 1-7-2020)", () => {
  const at = (jurisdiction: "DL" | "MH" | "KA", rule_id: string, date: string) =>
    compute(allThree.ruleSet, {
      jurisdiction,
      rule_id,
      execution_date: date,
      values: { consideration: "1000000" },
      facts: {},
    }).total_duty;

  it("all three states charge an identical 0.015% after 1-Jul-2020", () => {
    const dl = at("DL", "DL-ART62-share-transfer", "2021-06-01");
    const mh = at("MH", "MH-share-transfer", "2021-06-01");
    const ka = at("KA", "KA-share-transfer", "2021-06-01");
    expect([mh, ka]).toEqual([dl, dl]);
    expect(dl).toBe("150");
  });

  it("all three charged an identical 0.25% before the regime change", () => {
    const dl = at("DL", "DL-ART62-share-transfer", "2019-06-01");
    const mh = at("MH", "MH-share-transfer", "2019-06-01");
    const ka = at("KA", "KA-share-transfer", "2019-06-01");
    expect([mh, ka]).toEqual([dl, dl]);
    expect(dl).toBe("2500");
  });
});

describe("inter-state differential with real DL + MH rules (PRD §5.4)", () => {
  it("loads both statutes without parse errors", () => {
    expect(merged.parseErrors).toEqual([]);
  });

  it("charges the Delhi differential for a deed executed in Maharashtra relating to Delhi property", () => {
    // Same Rs 1 cr property. Executed in MH (5% = 5,00,000); property in DL, male
    // vendee, 2024, >25L → 3% stamp + 4% transfer = 7% = 7,00,000. Differential
    // payable in DL = 7,00,000 − 5,00,000 = 2,00,000 (credit for the MH duty).
    const executionMH = {
      jurisdiction: "MH" as const,
      rule_id: "MH-ART25-conveyance",
      execution_date: "2024-06-01",
      values: { market_value: "10000000" },
      facts: { area_type: "municipal_corporation" },
    };
    const propertyDL = {
      jurisdiction: "DL" as const,
      rule_id: "DL-ART23-conveyance",
      execution_date: "2024-06-01",
      values: { consideration: "10000000", market_value: "10000000" },
      facts: { buyer_category: "male", transferee_category: "male" },
    };
    const r = computeInterStateDifferential(merged.ruleSet, executionMH, propertyDL);
    expect(r.duty_execution_state).toBe("500000");
    expect(r.duty_property_state).toBe("700000");
    expect(r.differential_payable).toBe("200000");
    expect(r.excess_note).toBeNull();
  });

  it("does not refund when the execution-state duty is the higher one", () => {
    // Reverse: executed in DL (7,00,000), property in MH (5,00,000). No refund.
    const executionDL = {
      jurisdiction: "DL" as const,
      rule_id: "DL-ART23-conveyance",
      execution_date: "2024-06-01",
      values: { consideration: "10000000", market_value: "10000000" },
      facts: { buyer_category: "male", transferee_category: "male" },
    };
    const propertyMH = {
      jurisdiction: "MH" as const,
      rule_id: "MH-ART25-conveyance",
      execution_date: "2024-06-01",
      values: { market_value: "10000000" },
      facts: { area_type: "municipal_corporation" },
    };
    const r = computeInterStateDifferential(merged.ruleSet, executionDL, propertyMH);
    expect(r.differential_payable).toBe("0");
    expect(r.excess_note).toContain("does not refund");
  });
});
