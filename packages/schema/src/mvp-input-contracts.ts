import {
  RuleInputContractSchema,
  inputContractActiveOn,
  type DerivedFact,
  type InputField,
  type RuleInputContract,
} from "./input-contract.js";
import type { Jurisdiction } from "./primitives.js";

type Option = { value: string; label: string };

const money = (key: string, label: string, help?: string, required = true): InputField => ({
  key,
  label,
  kind: "value",
  type: "money",
  help,
  required,
});

const integer = (key: string, label: string, help?: string, required = true): InputField => ({
  key,
  label,
  kind: "value",
  type: "positive_integer",
  help,
  required,
});

const select = (
  key: string,
  label: string,
  options: Option[],
  help?: string,
  required = true,
): InputField => ({ key, label, kind: "fact", type: "select", options, help, required });

const yesNoUncertain: Option[] = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
  { value: "uncertain", label: "Uncertain" },
];

const transferee = () => select("transferee_category", "Transferee", [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "joint", label: "Joint (male + female)" },
]);

const mhArea = (required = true) => select("area_type", "Area classification", [
  { value: "municipal_corporation", label: "Municipal Corporation" },
  { value: "urban", label: "Other urban area" },
  { value: "cantonment", label: "Cantonment" },
  { value: "municipal_council", label: "Municipal Council" },
  { value: "nagar_panchayat", label: "Nagar Panchayat" },
  { value: "mmrda_rural", label: "MMRDA rural area" },
  { value: "influence_area", label: "Influence Area (ASR)" },
  { value: "gram_panchayat", label: "Gram Panchayat" },
  { value: "movable", label: "Movable property" },
], "Where the property is situated — determines the Article 25 rate", required);

const mhLbt = (required = true) => select("lbt_status", "Local Body Tax / local levy", [
  { value: "not_applicable", label: "Confirmed not applicable" },
  { value: "applies_or_uncertain", label: "May apply / uncertain" },
], "The draft corpus does not yet calculate omitted Maharashtra local levies", required);

const mhMetro = (required = true) => select("metro_cess_city", "Metro-cess city?", [
  { value: "yes", label: "Yes / possibly" },
  { value: "no", label: "No" },
], undefined, required);

const mhGccRemission = () => select(
  "mh_gcc_remission_scope",
  "Maharashtra GCC Policy remission",
  [
    { value: "not_applicable", label: "Confirmed not applicable" },
    { value: "eligible_or_uncertain", label: "Possibly eligible / uncertain" },
  ],
  "Potential 50–100% remission for eligible GCC-policy transactions from 3 November 2025 through 3 November 2030",
  false,
);

const mhAgriculturalLoanRemission = () => select(
  "mh_agricultural_loan_remission_scope",
  "Agricultural/crop-loan remission",
  [
    { value: "not_applicable", label: "Confirmed not applicable" },
    { value: "eligible_or_uncertain", label: "Agriculturist loan up to ₹2 lakh / uncertain" },
  ],
  "Potential full remission for listed instruments from 1 January 2026",
  false,
);

const mhSection9RemissionClaim = () => select(
  "mh_section9_remission_claim",
  "Other Maharashtra Government remission or concession",
  [
    { value: "none_identified", label: "None identified or claimed" },
    { value: "claimed_or_uncertain", label: "Claimed / project or policy may qualify / uncertain" },
  ],
  "Covers section 9 industrial, housing, infrastructure, public-project, logistics, and named-party orders outside the separately listed policy questions",
);

const kaArea = () => select("ka_area", "Local body", [
  { value: "urban", label: "Urban / BBMP" },
  { value: "rural", label: "Rural / Panchayat" },
], "Determines the local-body surcharge on the duty");

const contract = (
  jurisdiction: Jurisdiction,
  rule_id: string,
  effective_from: string,
  fields: InputField[],
  effective_to: string | null = null,
  derived_facts: DerivedFact[] = [],
): RuleInputContract => RuleInputContractSchema.parse({
  jurisdiction,
  rule_id,
  effective_from,
  effective_to,
  fields,
  derived_facts,
});

const dl = (ruleId: string, fields: InputField[]) => contract("DL", ruleId, "2015-01-01", fields);
const mh = (ruleId: string, fields: InputField[], derivedFacts: DerivedFact[] = []) =>
  contract("MH", ruleId, "2015-01-01", fields, null, derivedFacts);
const ka = (ruleId: string, fields: InputField[]) => contract("KA", ruleId, "2016-04-01", fields);

const dlPoaFacts = () => [
  select("poa_authorizes_property_sale", "Does it authorise sale of immovable property?", yesNoUncertain),
  select("poa_registration_only", "Is its sole purpose registration/admitting execution?", yesNoUncertain),
  select("poa_transaction_pattern", "Transactions covered", [
    { value: "single_transaction", label: "One transaction" },
    { value: "general_or_multiple", label: "General or multiple transactions" },
    { value: "uncertain", label: "Uncertain" },
  ]),
];

export const MVP_RULE_INPUT_CONTRACTS: RuleInputContract[] = [
  dl("DL-ART4-affidavit", [select("affidavit_purpose", "Affidavit purpose", [
    { value: "ordinary", label: "Ordinary purpose" },
    { value: "court_use", label: "Immediate filing/use in court" },
    { value: "armed_forces_enrolment", label: "Armed-forces enrolment" },
    { value: "pension_or_charitable_allowance", label: "Pension or charitable allowance" },
    { value: "uncertain", label: "Uncertain" },
  ])]),
  dl("DL-ART5c-agreement-to-sell", []),
  dl("DL-ART6-loan-hypothecation", [
    money("amount_secured", "Amount secured"),
    integer("repayment_period_months", "Repayment period (months)", "3 months or less attracts half duty"),
    select("security_instrument_type", "Security instrument", [
      { value: "title_deed_deposit", label: "Deposit of title deeds" },
      { value: "attested_pledge", label: "Attested pawn / pledge" },
      { value: "hypothecation", label: "Hypothecation" },
      { value: "unattested_pledge", label: "Unattested pawn / pledge" },
      { value: "uncertain", label: "Uncertain" },
    ]),
    select("accompanies_bill_of_exchange", "Does it accompany a bill of exchange?", yesNoUncertain),
  ]),
  dl("DL-ART15-bond", [
    money("amount_secured", "Amount secured"),
    select("obligor_category", "Obligor", [
      { value: "local_authority", label: "Local authority" },
      { value: "other", label: "Other" },
    ], undefined, false),
  ]),
  dl("DL-ART23-conveyance", [
    money("consideration", "Consideration"),
    money("market_value", "Circle rate / market value", "Duty is charged on the higher of the two"),
    transferee(),
  ]),
  dl("DL-ART23A-ats-part-performance", [money("consideration", "Consideration"), transferee()]),
  dl("DL-ART33-gift", [money("market_value", "Property value (approved valuer)"), transferee()]),
  dl("DL-ART34-indemnity-bond", [money("amount_secured", "Amount of indemnity")]),
  dl("DL-ART35-lease", [
    integer("term_months", "Term (months)", "Integer months; 11-month agreements are the < 1 year band"),
    money("total_rent_payable", "Total rent for the whole term", "Used only when the term is under 12 months", false),
    money("avg_annual_rent", "Average annual rent"),
    money("premium", "Premium / fine (0 if none)"),
  ]),
  dl("DL-leave-and-license", [
    integer("term_months", "Term (months)"),
    money("total_rent_payable", "Total licence fee for the whole term", "Used only when the term is under 12 months", false),
    money("avg_annual_rent", "Average annual licence fee"),
    money("premium", "Premium / non-refundable deposit (0 if none)"),
  ]),
  dl("DL-ART40a-mortgage-with-possession", [money("amount_secured", "Amount secured")]),
  dl("DL-ART40b-mortgage-without-possession", [
    money("amount_secured", "Amount secured"),
    select("is_collateral_or_auxiliary_security", "Is this collateral or auxiliary security?", yesNoUncertain),
  ]),
  dl("DL-ART46-partnership", [money("capital", "Capital contribution")]),
  dl("DL-ART46B-partnership-dissolution", []),
  dl("DL-llp-agreement", [money("capital", "Capital contribution")]),
  dl("DL-ART48-gpa", [...dlPoaFacts(), integer("authorized_person_count", "Number of persons authorised")]),
  dl("DL-ART48-spa", dlPoaFacts()),
  dl("DL-ART57-security-bond", [money("amount_secured", "Amount secured")]),
  dl("DL-works-contract", []),
  dl("DL-service-agreement", []),
  contract("DL", "DL-ART62-share-transfer", "2015-01-01", [
    money("share_value", "Share value (executions before 1 July 2020)"),
  ], "2020-07-01"),
  contract("DL", "DL-ART62-share-transfer", "2020-07-01", [
    money("consideration", "Consideration (executions on/after 1 July 2020)"),
  ]),

  mh("MH-ART4-affidavit", [select("affidavit_scope", "Affidavit purpose", [
    { value: "ordinary_non_exempt", label: "Ordinary non-exempt affidavit" },
    { value: "court_or_statutory_exempt", label: "Court/enrolment/pension/allowance purpose" },
    { value: "uncertain", label: "Uncertain" },
  ])]),
  mh("MH-ART25-conveyance", [
    money("market_value", "True market value (ready reckoner)"),
    mhArea(),
    mhMetro(),
    mhLbt(),
    select("buyer_all_women", "All purchasers women?", [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ], undefined, false),
    select("property_use", "Property use", [
      { value: "residential", label: "Residential" },
      { value: "commercial", label: "Commercial" },
      { value: "other", label: "Other" },
    ], undefined, false),
    mhSection9RemissionClaim(),
    mhGccRemission(),
  ]),
  mh("MH-ART34-gift", [
    money("market_value", "Market value"),
    select("gift_relation", "Donee relationship", [
      { value: "close_family_residential_agri", label: "Spouse/child/grandchild — residential or agricultural property" },
      { value: "family", label: "Family (spouse, sibling, lineal ascendant/descendant)" },
      { value: "other", label: "Other donee" },
    ]),
    mhArea(false),
    mhMetro(),
    mhLbt(),
  ]),
  mh("MH-ART35-indemnity-bond", []),
  mh("MH-ART36-lease", [
    integer("term_months", "Term (months)", "Renewal periods count as part of the term"),
    money("market_value", "Market value incl. premium/deposit", "Explanation I: premium, advances and deposits are treated as consideration"),
    mhArea(),
    select("lease_has_unentered_premium_advance_or_deposit", "Does the document contain any premium, advance, or deposit not included in the entered market value?", yesNoUncertain),
    select("lease_has_unentered_renewal_period", "Does the document contain any renewal period not included in the entered term?", yesNoUncertain),
    mhLbt(),
    mhSection9RemissionClaim(),
    mhGccRemission(),
  ], [{
    key: "lease_value_scope",
    cases: [{
      when: { all: [
        { eq: { field: "lease_has_unentered_premium_advance_or_deposit", value: "no" } },
        { eq: { field: "lease_has_unentered_renewal_period", value: "no" } },
      ] },
      value: "statutory_inclusive",
    }],
    default: "incomplete_or_uncertain",
  }]),
  mh("MH-ART36A-leave-license", [
    integer("term_months", "Term (months)"),
    money("licence_fee_total", "Total licence fees / rent for the term"),
    money("non_refundable_deposit", "Non-refundable deposit (0 if none)"),
    money("refundable_deposit", "Refundable deposit (0 if none)"),
    select("licence_has_unentered_payment", "Does the document contain any fee, rent, premium, advance, or deposit not represented above?", yesNoUncertain),
    money("market_value", "Market value (only if term exceeds 60 months)", undefined, false),
    mhArea(false),
    select("lease_has_unentered_premium_advance_or_deposit", "For a term over 60 months, is any premium, advance, or deposit absent from the entered market value?", yesNoUncertain, undefined, false),
    select("lease_has_unentered_renewal_period", "For a term over 60 months, is any renewal period absent from the entered term?", yesNoUncertain, undefined, false),
    mhLbt(false),
    mhGccRemission(),
  ], [
    {
      key: "licence_payment_scope",
      cases: [{
        when: { eq: { field: "licence_has_unentered_payment", value: "no" } },
        value: "statutory_inputs_confirmed",
      }],
      default: "incomplete_or_uncertain",
    },
    {
      key: "lease_value_scope",
      cases: [{
        when: { all: [
          { eq: { field: "lease_has_unentered_premium_advance_or_deposit", value: "no" } },
          { eq: { field: "lease_has_unentered_renewal_period", value: "no" } },
        ] },
        value: "statutory_inclusive",
      }],
      default: "incomplete_or_uncertain",
    },
  ]),
  mh("MH-ART39-moa", [
    money("share_capital", "Share capital"),
    select("accompanied_by_aoa", "Accompanied by AoA?", [
      { value: "yes", label: "Yes — flat ₹1,000" },
      { value: "no", label: "No — ad valorem" },
    ]),
  ]),
  mh("MH-ART40a-mortgage-with-possession", [
    money("amount_secured", "Amount secured"),
    mhArea(),
    select("mortgage_subtype", "Mortgage subtype", [
      { value: "non_usufructuary", label: "Non-usufructuary" },
      { value: "usufructuary_or_uncertain", label: "Usufructuary / uncertain" },
    ]),
    mhMetro(),
    mhLbt(),
    mhSection9RemissionClaim(),
    mhGccRemission(),
    mhAgriculturalLoanRemission(),
  ]),
  contract("MH", "MH-ART40b-mortgage-without-possession", "2015-01-01", [
    money("amount_secured", "Amount secured"),
    mhSection9RemissionClaim(),
  ], "2022-01-20"),
  contract("MH", "MH-ART40b-mortgage-without-possession", "2022-01-20", [
    money("amount_secured", "Amount secured"),
    select("mortgagee_bank_scope", "Mortgagee", [
      { value: "other", label: "Not a consortium of banks" },
      { value: "consortium_of_banks", label: "Consortium of banks" },
      { value: "uncertain", label: "Uncertain" },
    ]),
    mhSection9RemissionClaim(),
    mhGccRemission(),
    mhAgriculturalLoanRemission(),
  ]),
  mh("MH-ART47-partnership", [money("share_contribution", "Cash share contribution")]),
  mh("MH-ART47-llp", [money("share_contribution", "Cash share contribution")]),
  mh("MH-ART48-poa", [
    select("poa_authorizes_immovable_transfer", "Does the POA authorise sale or transfer of immovable property?", yesNoUncertain),
    select("poa_grants_developer_promoter_powers", "Does it grant promoter/developer powers for construction, development, sale, or transfer?", yesNoUncertain),
    select("poa_document_purpose", "What does the document authorise?", [
      { value: "registration_single_transaction", label: "Registration/admitting execution for one transaction" },
      { value: "small_cause_court", label: "Proceedings under the Presidency Small Cause Courts Act" },
      { value: "single_transaction_other", label: "One transaction, other than registration-only" },
      { value: "one_person_general", label: "One person acting generally or in multiple transactions" },
      { value: "multiple_persons_general", label: "Multiple persons acting jointly/severally or generally" },
      { value: "other", label: "Another purpose" },
      { value: "uncertain", label: "Uncertain" },
    ]),
  ], [{
    key: "poa_scope",
    cases: [{
      when: { all: [
        { eq: { field: "poa_authorizes_immovable_transfer", value: "no" } },
        { eq: { field: "poa_grants_developer_promoter_powers", value: "no" } },
        { in: { field: "poa_document_purpose", values: [
          "registration_single_transaction",
          "small_cause_court",
          "single_transaction_other",
          "one_person_general",
          "multiple_persons_general",
        ] } },
      ] },
      value: "fixed_clauses_a_to_e",
    }],
    default: "nonfixed_or_uncertain",
  }]),
  mh("MH-ART54-security-bond", [
    money("amount_secured", "Amount secured"),
    select("security_bond_scope", "Article 54 bond purpose", [
      { value: "ordinary_non_exempt", label: "Ordinary non-exempt security / surety bond" },
      { value: "charitable_public_utility_guarantee", label: "Guarantee of subscribed local income for a charitable dispensary, hospital, or public utility" },
      { value: "irrigation_section_114", label: "Instrument under Maharashtra Irrigation Act section 114 rules" },
      { value: "agricultural_loan_advance", label: "Security for an advance under the Land Improvement Loans or Agriculturists Loans Act" },
      { value: "government_officer_security", label: "Government officer / surety securing office execution or accounting" },
      { value: "uncertain", label: "Uncertain" },
    ]),
    select("principal_art40_duty_status", "Principal's Article 40 duty", [
      { value: "not_paid", label: "No Article 40 mortgage duty was paid" },
      { value: "paid", label: "Article 40 mortgage duty was paid" },
      { value: "uncertain", label: "Uncertain" },
    ], undefined, false),
    mhGccRemission(),
    mhAgriculturalLoanRemission(),
  ]),
  mh("MH-ART5hB-service-agreement", [
    select("service_goods_transfer", "Will supplied or incorporated goods/materials become the customer's property?", yesNoUncertain),
    select("service_additional_transaction", "Does the document also record non-service transaction rights?", yesNoUncertain,
      "Includes sale/transfer, development or construction rights, lease/licence, security, agency, or another transaction beyond supplying services"),
  ], [{
    key: "agreement_scope",
    cases: [{
      when: { all: [
        { eq: { field: "service_goods_transfer", value: "no" } },
        { eq: { field: "service_additional_transaction", value: "no" } },
      ] },
      value: "residual_no_specific_article",
    }],
    default: "specific_or_uncertain",
  }]),
  mh("MH-ART63-works-contract", [money("contract_value", "Contract value")]),
  contract("MH", "MH-share-transfer", "2015-01-01", [
    money("share_value", "Share value (executions before 1 July 2020)"),
  ], "2020-07-01"),
  contract("MH", "MH-share-transfer", "2020-07-01", [money("consideration", "Consideration")]),

  ka("KA-ART4-affidavit", []),
  ka("KA-ART20-rate", [money("market_value", "Market value (guidance value)"), kaArea()]),
  ka("KA-ART20-conveyance", [
    money("market_value", "Market value (guidance value)"),
    select("first_sale_flat", "First sale of a flat/apartment?", [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ]),
    kaArea(),
  ]),
  ka("KA-ART28-gift", [
    money("market_value", "Market value"),
    select("gift_relation_ka", "Donee relationship", [
      { value: "family", label: "Family (father/mother/spouse/child/daughter-in-law/sibling/grandchild)" },
      { value: "other", label: "Other donee" },
    ]),
    select("area_type", "Property location", [
      { value: "bbmp_bmrda_city_corp", label: "BBMP / BMRDA / City Corporation" },
      { value: "town_municipal_town_panchayat", label: "Town Municipal Council / Town Panchayat" },
      { value: "rural", label: "Other areas" },
    ], "Determines the fixed family-gift amount"),
  ]),
  ka("KA-ART29-indemnity-bond", [money("amount_secured", "Amount of indemnity")]),
  ka("KA-ART30-lease", [
    integer("term_months", "Term (months)"),
    money("avg_annual_rent", "Average annual rent"),
    money("premium", "Premium / fine (0 if none)"),
    money("fine", "Fine (0 if none)"),
    money("money_advanced", "Money advanced / security deposit (0 if none)", "Includes refundable deposits per the Explanation"),
    money("market_value", "Market value (only if term exceeds 30 years)", undefined, false),
    select("property_use", "Property use", [
      { value: "residential", label: "Residential" },
      { value: "commercial", label: "Commercial / industrial" },
    ]),
  ]),
  ka("KA-ART34a-mortgage-with-possession", [money("amount_secured", "Amount secured")]),
  ka("KA-ART34b-mortgage-without-possession", [money("amount_secured", "Amount secured")]),
  ka("KA-ART34d-hypothecation", [money("amount_secured", "Loan amount")]),
  ka("KA-ART40-partnership", [money("capital", "Capital")]),
  ka("KA-ART40A-llp", [money("capital", "Capital")]),
  ka("KA-ART41-poa", []),
  ka("KA-ART47-security-bond", [money("amount_secured", "Amount secured")]),
  ka("KA-ART5j-works-contract", []),
  ka("KA-ART5j-service-agreement", []),
  contract("KA", "KA-share-transfer", "2016-04-01", [money("consideration", "Pre-2020 share value")], "2020-07-01"),
  contract("KA", "KA-share-transfer", "2020-07-01", [money("consideration", "Consideration")]),
];

export function resolveMvpInputContract(
  jurisdiction: Jurisdiction,
  ruleId: string,
  date: string,
): RuleInputContract | undefined {
  const matches = MVP_RULE_INPUT_CONTRACTS.filter(
    (candidate) =>
      candidate.jurisdiction === jurisdiction &&
      candidate.rule_id === ruleId &&
      inputContractActiveOn(candidate, date),
  );
  if (matches.length > 1) {
    throw new Error(`overlapping input contracts for ${jurisdiction}/${ruleId} on ${date}`);
  }
  return matches[0];
}

export function mergedInputFields(ruleId: string): InputField[] {
  const contracts = MVP_RULE_INPUT_CONTRACTS.filter((candidate) => candidate.rule_id === ruleId)
    .sort((left, right) => left.effective_from.localeCompare(right.effective_from));
  if (contracts.length === 0) throw new Error(`no input contract for ${ruleId}`);
  const keys = [...new Set(contracts.flatMap((candidate) => candidate.fields.map((field) => field.key)))];
  return keys.map((key) => {
    const fields = contracts.flatMap((candidate) => candidate.fields.filter((field) => field.key === key));
    const first = fields[0]!;
    return {
      ...first,
      required: contracts.every(
        (candidate) => candidate.fields.some((field) => field.key === key && field.required),
      ),
    };
  });
}

export function inputFieldsForRuleOn(ruleId: string, date: string): InputField[] {
  const matches = MVP_RULE_INPUT_CONTRACTS.filter(
    (candidate) => candidate.rule_id === ruleId && inputContractActiveOn(candidate, date),
  );
  if (matches.length > 1) throw new Error(`overlapping input contracts for ${ruleId} on ${date}`);
  return matches[0]?.fields ?? mergedInputFields(ruleId);
}
