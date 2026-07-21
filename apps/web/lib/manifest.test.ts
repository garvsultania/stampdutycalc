import { describe, expect, it } from "vitest";
import { inputFieldsForRuleOn, mergedInputFields } from "@stampdraft/schema";
import { CATALOG, fieldsForRuleAtDate } from "./manifest";

describe("derived computation manifest", () => {
  it("derives every variant field from the shared contract registry", () => {
    for (const instruments of Object.values(CATALOG)) {
      for (const instrument of instruments) {
        for (const variant of instrument.variants) {
          expect(variant.fields.map((field) => field.key)).toEqual(
            mergedInputFields(variant.rule_id).map((field) => field.key),
          );
        }
      }
    }
  });

  it("switches historical fields with the execution date", () => {
    expect(fieldsForRuleAtDate("DL-ART62-share-transfer", "2019-06-01").map((field) => field.key))
      .toEqual(["share_value"]);
    expect(fieldsForRuleAtDate("DL-ART62-share-transfer", "2024-06-01").map((field) => field.key))
      .toEqual(["consideration"]);
    expect(inputFieldsForRuleOn("MH-share-transfer", "2019-06-01").map((field) => field.key))
      .toEqual(["share_value"]);
    expect(inputFieldsForRuleOn("MH-share-transfer", "2024-06-01").map((field) => field.key))
      .toEqual(["consideration"]);
  });

  it("shows observable service questions instead of the derived legal conclusion", () => {
    expect(fieldsForRuleAtDate("MH-ART5hB-service-agreement", "2024-06-01").map((field) => field.key))
      .toEqual(["service_goods_transfer", "service_additional_transaction"]);
  });

  it("shows observable POA questions instead of the derived Article 48 scope", () => {
    expect(fieldsForRuleAtDate("MH-ART48-poa", "2024-06-01").map((field) => field.key)).toEqual([
      "poa_authorizes_immovable_transfer",
      "poa_grants_developer_promoter_powers",
      "poa_document_purpose",
    ]);
  });

  it("shows Article 54 exemption and principal-duty questions", () => {
    expect(fieldsForRuleAtDate("MH-ART54-security-bond", "2026-07-21").map((field) => field.key)).toEqual([
      "amount_secured",
      "security_bond_scope",
      "principal_art40_duty_status",
      "mh_gcc_remission_scope",
      "mh_agricultural_loan_remission_scope",
    ]);
  });

  it("adds the Article 40 consortium question only in the current era", () => {
    expect(fieldsForRuleAtDate("MH-ART40b-mortgage-without-possession", "2022-01-19").map((field) => field.key))
      .toEqual(["amount_secured", "mh_section9_remission_claim"]);
    expect(fieldsForRuleAtDate("MH-ART40b-mortgage-without-possession", "2022-01-20").map((field) => field.key))
      .toEqual([
        "amount_secured",
        "mortgagee_bank_scope",
        "mh_section9_remission_claim",
        "mh_gcc_remission_scope",
        "mh_agricultural_loan_remission_scope",
      ]);
  });

  it("shows observable lease and licence completeness questions", () => {
    expect(fieldsForRuleAtDate("MH-ART36-lease", "2024-06-01").map((field) => field.key)).toEqual([
      "term_months",
      "market_value",
      "area_type",
      "lease_has_unentered_premium_advance_or_deposit",
      "lease_has_unentered_renewal_period",
      "lbt_status",
      "mh_section9_remission_claim",
      "mh_gcc_remission_scope",
    ]);
    expect(fieldsForRuleAtDate("MH-ART36A-leave-license", "2024-06-01").map((field) => field.key)).toContain(
      "licence_has_unentered_payment",
    );
  });
});
