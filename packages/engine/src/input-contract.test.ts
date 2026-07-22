import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { buildSnapshot, compute, loadStateDir, mergeLoads, validateRuleSet } from "./index.js";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const corpus = mergeLoads([
  loadStateDir(root("../../../rules/DL")),
  loadStateDir(root("../../../rules/MH")),
  loadStateDir(root("../../../rules/KA")),
]);

const conveyance = {
  jurisdiction: "DL" as const,
  rule_id: "DL-ART23-conveyance",
  execution_date: "2024-06-01",
  values: { consideration: "1000000", market_value: "1000000" },
  facts: { transferee_category: "male" },
};

describe("per-rule input contracts", () => {
  it("attaches a matching contract to every MVP rule version", () => {
    expect(corpus.parseErrors).toEqual([]);
    for (const rule of corpus.ruleSet.rules) {
      expect(rule.input_contract).toMatchObject({
        jurisdiction: rule.jurisdiction,
        rule_id: rule.rule_id,
      });
    }
  });

  it("rejects missing, unknown, negative, non-integral, and out-of-enum inputs", () => {
    expect(() => compute(corpus.ruleSet, { ...conveyance, facts: {} })).toThrow(/transferee_category/);
    expect(() => compute(corpus.ruleSet, {
      ...conveyance,
      values: { ...conveyance.values, market_value_typo: "1" },
    })).toThrow(/unknown input value.*market_value_typo/);
    expect(() => compute(corpus.ruleSet, {
      ...conveyance,
      values: { ...conveyance.values, consideration: "-1" },
    })).toThrow(/non-negative decimal amount/);
    expect(() => compute(corpus.ruleSet, {
      jurisdiction: "DL", rule_id: "DL-ART35-lease", execution_date: "2024-06-01",
      values: { term_months: "12.5", avg_annual_rent: "100000", premium: "0" }, facts: {},
    })).toThrow(/positive integer/);
    expect(() => compute(corpus.ruleSet, {
      ...conveyance,
      facts: { transferee_category: "corporate" },
    })).toThrow(/must be one of/);
  });

  it("keeps arithmetic mode subject to the same input contract", () => {
    expect(() => compute(corpus.ruleSet, {
      ...conveyance,
      values: { ...conveyance.values, consideration: "-1" },
    }, { pendingPolicy: "arithmetic-test-only" })).toThrow(/non-negative decimal amount/);
  });

  it("selects date-specific contracts for the share-transfer regime", () => {
    expect(compute(corpus.ruleSet, {
      jurisdiction: "DL", rule_id: "DL-ART62-share-transfer", execution_date: "2019-06-01",
      values: { share_value: "1000000" }, facts: {},
    }).total_duty).toBe("2500");
    expect(() => compute(corpus.ruleSet, {
      jurisdiction: "DL", rule_id: "DL-ART62-share-transfer", execution_date: "2019-06-01",
      values: { consideration: "1000000" }, facts: {},
    })).toThrow(/unknown input value.*consideration/);
    expect(compute(corpus.ruleSet, {
      jurisdiction: "DL", rule_id: "DL-ART62-share-transfer", execution_date: "2021-06-01",
      values: { consideration: "1000000" }, facts: {},
    }).total_duty).toBe("150");
    expect(compute(corpus.ruleSet, {
      jurisdiction: "MH", rule_id: "MH-share-transfer", execution_date: "2019-06-01",
      values: { share_value: "1000000" }, facts: {},
    }).total_duty).toBe("2500");
    expect(() => compute(corpus.ruleSet, {
      jurisdiction: "MH", rule_id: "MH-share-transfer", execution_date: "2019-06-01",
      values: { consideration: "1000000" }, facts: {},
    })).toThrow(/unknown input value.*consideration/);
  });

  it("includes the contract in the canonical snapshot identity", () => {
    const original = buildSnapshot(corpus.ruleSet, "DL", "2024-06-01").hash;
    const changed = {
      ...corpus.ruleSet,
      rules: corpus.ruleSet.rules.map((rule) =>
        rule.rule_id === "DL-ART23-conveyance" && rule.input_contract
          ? {
              ...rule,
              input_contract: {
                ...rule.input_contract,
                fields: rule.input_contract.fields.map((field) =>
                  field.key === "consideration" ? { ...field, label: "Declared consideration" } : field,
                ),
              },
            }
          : rule,
      ),
    };
    expect(buildSnapshot(changed, "DL", "2024-06-01").hash).not.toBe(original);
  });

  it("validates contract presence, identity, and full-era coverage", () => {
    const rule = corpus.ruleSet.rules.find((candidate) => candidate.rule_id === "DL-ART23-conveyance")!;
    const contract = rule.input_contract!;
    const issuesFor = (changedRule: typeof rule) => validateRuleSet({
      rules: [changedRule], modifiers: [], penaltyRegimes: [],
    }).map((issue) => issue.message);

    expect(issuesFor({ ...rule, input_contract: undefined })).toContain(
      "MVP rule is missing its per-rule input contract",
    );
    expect(issuesFor({ ...rule, input_contract: { ...contract, rule_id: "DL-WRONG" } }))
      .toContain("input contract identity DL::DL-WRONG does not match its rule");
    expect(issuesFor({ ...rule, input_contract: { ...contract, effective_from: "2020-01-01" } }))
      .toContain("input contract is not active throughout [2015-01-01, ∞)");
  });

  it("derives the Maharashtra service classification from observable answers", () => {
    const service = {
      jurisdiction: "MH" as const,
      rule_id: "MH-ART5hB-service-agreement",
      execution_date: "2024-06-01",
      values: {},
      facts: { service_goods_transfer: "no", service_additional_transaction: "no" },
    };
    const output = compute(corpus.ruleSet, service);
    expect(output.total_duty).toBe("100");
    expect(output.inputs_echo.facts).toEqual(service.facts);

    expect(() => compute(corpus.ruleSet, {
      ...service,
      facts: { agreement_scope: "residual_no_specific_article" },
    })).toThrow(/unknown input fact.*agreement_scope/);
    expect(() => compute(corpus.ruleSet, {
      ...service,
      facts: { service_goods_transfer: "yes", service_additional_transaction: "no" },
    })).toThrow(/engine derives this classification from observable document answers/);
    expect(() => compute(corpus.ruleSet, {
      ...service,
      facts: { service_goods_transfer: "no", service_additional_transaction: "uncertain" },
    })).toThrow(/engine derives this classification from observable document answers/);
  });

  it("derives the Maharashtra fixed POA scope and refuses non-flat branches", () => {
    const poa = {
      jurisdiction: "MH" as const,
      rule_id: "MH-ART48-poa",
      execution_date: "2024-06-01",
      values: {},
      facts: {
        poa_authorizes_immovable_transfer: "no",
        poa_grants_developer_promoter_powers: "no",
        poa_document_purpose: "one_person_general",
      },
    };
    expect(compute(corpus.ruleSet, poa).total_duty).toBe("500");
    expect(compute(corpus.ruleSet, { ...poa, execution_date: "2015-03-01" }).total_duty).toBe("100");
    expect(() => compute(corpus.ruleSet, {
      ...poa,
      facts: { poa_scope: "fixed_clauses_a_to_e" },
    })).toThrow(/unknown input fact.*poa_scope/);
    expect(() => compute(corpus.ruleSet, {
      ...poa,
      facts: { ...poa.facts, poa_authorizes_immovable_transfer: "yes" },
    })).toThrow(/derived from observable document-purpose answers/);
    expect(() => compute(corpus.ruleSet, {
      ...poa,
      facts: { ...poa.facts, poa_document_purpose: "other" },
    })).toThrow(/clause \(h\)/);
  });

  it("derives Maharashtra lease and licence completeness scopes", () => {
    const lease = {
      jurisdiction: "MH" as const,
      rule_id: "MH-ART36-lease",
      execution_date: "2024-06-01",
      values: { market_value: "10000000", term_months: "72" },
      facts: {
        area_type: "municipal_corporation",
        lease_has_unentered_premium_advance_or_deposit: "no",
        lease_has_unentered_renewal_period: "no",
        lbt_status: "not_applicable",
        mh_section9_remission_claim: "none_identified",
      },
    };
    expect(compute(corpus.ruleSet, lease).total_duty).toBe("125000");
    expect(() => compute(corpus.ruleSet, {
      ...lease,
      facts: { lease_value_scope: "statutory_inclusive" },
    })).toThrow(/unknown input fact.*lease_value_scope/);
    expect(() => compute(corpus.ruleSet, {
      ...lease,
      facts: { ...lease.facts, lease_has_unentered_renewal_period: "yes" },
    })).toThrow(/observable completeness answers/);

    const licence = {
      jurisdiction: "MH" as const,
      rule_id: "MH-ART36A-leave-license",
      execution_date: "2024-06-01",
      values: {
        term_months: "24",
        licence_fee_total: "1200000",
        non_refundable_deposit: "0",
        refundable_deposit: "500000",
      },
      facts: { licence_has_unentered_payment: "no" },
    };
    expect(compute(corpus.ruleSet, licence).total_duty).toBe("3125");
    expect(() => compute(corpus.ruleSet, {
      ...licence,
      facts: { licence_payment_scope: "statutory_inputs_confirmed" },
    })).toThrow(/unknown input fact.*licence_payment_scope/);
    expect(() => compute(corpus.ruleSet, {
      ...licence,
      facts: { licence_has_unentered_payment: "uncertain" },
    })).toThrow(/observable completeness answer/);

    const longLicence = {
      ...licence,
      values: {
        ...licence.values,
        term_months: "72",
        market_value: "10000000",
      },
      facts: {
        licence_has_unentered_payment: "no",
        area_type: "municipal_corporation",
        lbt_status: "not_applicable",
      },
    };
    expect(() => compute(corpus.ruleSet, longLicence)).toThrow(/observable completeness answers/);
    expect(compute(corpus.ruleSet, {
      ...longLicence,
      facts: {
        ...longLicence.facts,
        lease_has_unentered_premium_advance_or_deposit: "no",
        lease_has_unentered_renewal_period: "no",
      },
    }).total_duty).toBe("125000");
  });
});
