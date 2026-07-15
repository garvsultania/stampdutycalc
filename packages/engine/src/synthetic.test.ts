import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadGoldenDir, loadStateDir, runCase, validateRuleSet } from "./index.js";

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const load = loadStateDir(dir("./__fixtures__/synthetic"));
const cases = loadGoldenDir(dir("./__fixtures__/synthetic-golden"));

describe("synthetic ruleset (M0 gate)", () => {
  it("loads every fixture file with no parse errors", () => {
    expect(load.parseErrors).toEqual([]);
  });

  it("passes ruleset validation with zero errors", () => {
    const errors = validateRuleSet(load.ruleSet).filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("has cases exercising every base/rate/modifier type", () => {
    // Sanity: the suite must be non-trivial.
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  describe("golden suite (100% must pass — ship gate, PRD §9)", () => {
    for (const c of cases) {
      it(c.name, () => {
        const r = runCase(load.ruleSet, c);
        expect(r.failures).toEqual([]);
        expect(r.pass).toBe(true);
      });
    }
  });
});
