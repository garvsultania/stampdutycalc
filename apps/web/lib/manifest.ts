/**
 * UI manifest: what a lawyer must supply per instrument, per state (PRD Flow A).
 * This mirrors — never replaces — the engine's own escalate-on-missing-fact
 * behaviour: if the manifest misses a required input, the engine still refuses
 * to guess and the UI surfaces the escalation.
 */

export type FieldType = "money" | "months" | "select";

export interface Field {
  key: string;
  label: string;
  kind: "value" | "fact";
  type: FieldType;
  help?: string;
  optional?: boolean;
  options?: { value: string; label: string }[];
}

export interface Variant {
  rule_id: string;
  label: string;
  description?: string;
  fields: Field[];
}

export interface InstrumentDef {
  slug: string;
  name: string;
  article: string;
  summary: string;
  variants: Variant[];
}

const money = (key: string, label: string, help?: string, optional = false): Field => ({
  key, label, kind: "value", type: "money", help, optional,
});
const months = (key: string, label: string, help?: string): Field => ({
  key, label, kind: "value", type: "months", help,
});
const fact = (key: string, label: string, options: { value: string; label: string }[], help?: string): Field => ({
  key, label, kind: "fact", type: "select", options, help,
});

const TRANSFEREE = fact("transferee_category", "Transferee", [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "joint", label: "Joint (male + female)" },
]);

const MH_AREA = fact("area_type", "Area classification", [
  { value: "municipal_corporation", label: "Municipal Corporation" },
  { value: "urban", label: "Other urban area" },
  { value: "cantonment", label: "Cantonment" },
  { value: "municipal_council", label: "Municipal Council" },
  { value: "nagar_panchayat", label: "Nagar Panchayat" },
  { value: "mmrda_rural", label: "MMRDA rural area" },
  { value: "influence_area", label: "Influence Area (ASR)" },
  { value: "gram_panchayat", label: "Gram Panchayat" },
  { value: "movable", label: "Movable property" },
], "Where the property is situated — determines the Article 25 rate");

const KA_AREA_SURCHARGE = fact("ka_area", "Local body", [
  { value: "urban", label: "Urban / BBMP" },
  { value: "rural", label: "Rural / Panchayat" },
], "Determines the local-body surcharge on the duty");

export const CATALOG: Record<"DL" | "MH" | "KA", InstrumentDef[]> = {
  DL: [
    {
      slug: "conveyance", name: "Conveyance / Sale deed", article: "Art. 23",
      summary: "Sale of immovable property. Stamp duty + MCD transfer duty on the higher of consideration or circle value.",
      variants: [{
        rule_id: "DL-ART23-conveyance", label: "Sale of immovable property",
        fields: [money("consideration", "Consideration"), money("market_value", "Circle rate / market value", "Duty is charged on the higher of the two"), TRANSFEREE],
      }],
    },
    {
      slug: "gift", name: "Gift deed", article: "Art. 33",
      summary: "Charged as a conveyance on the value of the property, plus transfer duty.",
      variants: [{
        rule_id: "DL-ART33-gift", label: "Gift of immovable property",
        fields: [money("market_value", "Property value (approved valuer)"), TRANSFEREE],
      }],
    },
    {
      slug: "agreement-to-sell", name: "Agreement to sell", article: "Art. 23A / 5(c)",
      summary: "The possession fork: with possession it is a conveyance in part performance; without, a ₹50 agreement.",
      variants: [
        {
          rule_id: "DL-ART23A-ats-part-performance", label: "Possession delivered (s.53A part performance)",
          description: "90% of conveyance duty + transfer duty on 90% of consideration",
          fields: [money("consideration", "Consideration"), TRANSFEREE],
        },
        { rule_id: "DL-ART5c-agreement-to-sell", label: "Possession NOT delivered", description: "Flat ₹50 under Article 5(c)", fields: [] },
      ],
    },
    {
      slug: "lease", name: "Lease / Rent agreement", article: "Art. 35",
      summary: "Term-banded: Bond duty up to 5 years, conveyance duty on rent multiples beyond.",
      variants: [{
        rule_id: "DL-ART35-lease", label: "Lease of immovable property",
        fields: [
          months("term_months", "Term (months)", "Integer months; 11-month agreements are the < 1 year band"),
          money("total_rent_payable", "Total rent for the whole term", "Used only when the term is under 12 months", true),
          money("avg_annual_rent", "Average annual rent"),
          money("premium", "Premium / fine (0 if none)"),
        ],
      }],
    },
    {
      slug: "leave-license", name: "Leave & license", article: "Art. 35",
      summary: "Charged as an 'agreement to let' under Article 35 — same bands as a lease.",
      variants: [{
        rule_id: "DL-leave-and-license", label: "Leave & license agreement",
        fields: [
          months("term_months", "Term (months)"),
          money("total_rent_payable", "Total licence fee for the whole term", "Used only when the term is under 12 months", true),
          money("avg_annual_rent", "Average annual licence fee"),
          money("premium", "Premium / non-refundable deposit (0 if none)"),
        ],
      }],
    },
    {
      slug: "mortgage", name: "Mortgage deed", article: "Art. 40",
      summary: "With possession: conveyance duty + transfer duty. Without: 2% capped at ₹2 lakh.",
      variants: [
        { rule_id: "DL-ART40a-mortgage-with-possession", label: "Possession given / agreed", fields: [money("amount_secured", "Amount secured")] },
        { rule_id: "DL-ART40b-mortgage-without-possession", label: "Possession not given", fields: [money("amount_secured", "Amount secured")] },
      ],
    },
    {
      slug: "loan-hypothecation", name: "Loan / hypothecation", article: "Art. 6",
      summary: "Deposit of title deeds, pawn, pledge or hypothecation securing a loan.",
      variants: [{
        rule_id: "DL-ART6-loan-hypothecation", label: "Agreement securing a loan or debt",
        fields: [money("amount_secured", "Amount secured"), months("repayment_period_months", "Repayment period (months)", "3 months or less attracts half duty")],
      }],
    },
    {
      slug: "indemnity", name: "Indemnity bond", article: "Art. 34",
      summary: "Same duty as a security bond — effectively ₹100 above ₹1,000.",
      variants: [{ rule_id: "DL-ART34-indemnity-bond", label: "Indemnity bond", fields: [money("amount_secured", "Amount of indemnity")] }],
    },
    {
      slug: "guarantee", name: "Guarantee / security bond", article: "Art. 57",
      summary: "Surety securing due performance — 2% up to ₹1,000, else flat ₹100.",
      variants: [{ rule_id: "DL-ART57-security-bond", label: "Security / surety bond", fields: [money("amount_secured", "Amount secured")] }],
    },
    {
      slug: "partnership", name: "Partnership deed", article: "Art. 46",
      summary: "1% of capital, capped at ₹5,000. Dissolution is a flat ₹200.",
      variants: [
        { rule_id: "DL-ART46-partnership", label: "Constitution of partnership", fields: [money("capital", "Capital contribution")] },
        { rule_id: "DL-ART46B-partnership-dissolution", label: "Dissolution", fields: [] },
      ],
    },
    {
      slug: "llp", name: "LLP agreement", article: "Art. 46",
      summary: "Charged as a partnership instrument (practice-based, flagged for verification).",
      variants: [{ rule_id: "DL-llp-agreement", label: "LLP agreement", fields: [money("capital", "Capital contribution")] }],
    },
    {
      slug: "poa", name: "Power of attorney", article: "Art. 48",
      summary: "General ₹50; special ₹50. POA-for-consideration-to-sell is charged as a conveyance — classify first.",
      variants: [
        { rule_id: "DL-ART48-gpa", label: "General POA", fields: [] },
        { rule_id: "DL-ART48-spa", label: "Special POA (single transaction)", fields: [] },
      ],
    },
    {
      slug: "affidavit", name: "Affidavit", article: "Art. 4",
      summary: "Flat ₹10. Court, enrolment and pension affidavits are exempt.",
      variants: [{ rule_id: "DL-ART4-affidavit", label: "Affidavit", fields: [] }],
    },
    {
      slug: "works-service", name: "Works contract / service agreement", article: "Art. 5",
      summary: "Both are ₹50 agreements in Delhi — but classify for S.6 and multi-state work.",
      variants: [
        { rule_id: "DL-works-contract", label: "Works contract", fields: [] },
        { rule_id: "DL-service-agreement", label: "Service agreement", fields: [] },
      ],
    },
    {
      slug: "share-transfer", name: "Share transfer (physical)", article: "Art. 62 / s.9A",
      summary: "Union law: 0.015% of consideration since 1 July 2020; 0.25% before.",
      variants: [{ rule_id: "DL-ART62-share-transfer", label: "Transfer of shares (SH-4)", fields: [money("consideration", "Consideration")] }],
    },
  ],

  MH: [
    {
      slug: "conveyance", name: "Conveyance / Sale deed", article: "Art. 25",
      summary: "Area-based rate on true market value, women's concession, metro cess in the six metro cities.",
      variants: [{
        rule_id: "MH-ART25-conveyance", label: "Sale of property",
        fields: [
          money("market_value", "True market value (ready reckoner)"),
          MH_AREA,
          fact("metro_cess_city", "Metro-cess city?", [
            { value: "yes", label: "Yes — Mumbai/Thane/Navi Mumbai/Pune/Nagpur/Nashik" },
            { value: "no", label: "No" },
          ], "1% metro cess applies in the six metro cities from 1 Apr 2022"),
          fact("buyer_all_women", "All purchasers women?", [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]),
          fact("property_use", "Property use", [
            { value: "residential", label: "Residential" },
            { value: "commercial", label: "Commercial" },
            { value: "other", label: "Other" },
          ]),
        ],
      }],
    },
    {
      slug: "gift", name: "Gift deed", article: "Art. 34",
      summary: "₹200 to close family (residential/agri), 3% to family, else full conveyance rate.",
      variants: [{
        rule_id: "MH-ART34-gift", label: "Gift of property",
        fields: [
          money("market_value", "Market value"),
          fact("gift_relation", "Donee relationship", [
            { value: "close_family_residential_agri", label: "Spouse/child/grandchild — residential or agricultural property" },
            { value: "family", label: "Family (spouse, sibling, lineal ascendant/descendant)" },
            { value: "other", label: "Other donee" },
          ]),
          MH_AREA,
        ],
      }],
    },
    {
      slug: "lease", name: "Lease", article: "Art. 36",
      summary: "Conveyance rate on 10/25/50/90% of market value by term band. Premium counts as consideration.",
      variants: [{
        rule_id: "MH-ART36-lease", label: "Lease of immovable property",
        fields: [
          months("term_months", "Term (months)", "Renewal periods count as part of the term"),
          money("market_value", "Market value incl. premium/deposit", "Explanation I: premium, advances and deposits are treated as consideration"),
          MH_AREA,
        ],
      }],
    },
    {
      slug: "leave-license", name: "Leave & license", article: "Art. 36A",
      summary: "0.25% of rent + non-refundable deposit + 10% of refundable deposit (terms up to 60 months).",
      variants: [{
        rule_id: "MH-ART36A-leave-license", label: "Leave & license agreement",
        fields: [
          months("term_months", "Term (months)"),
          money("licence_fee_total", "Total licence fees / rent for the term"),
          money("non_refundable_deposit", "Non-refundable deposit (0 if none)"),
          money("refundable_deposit", "Refundable deposit (0 if none)"),
          money("market_value", "Market value (only if term exceeds 60 months)", undefined, true),
          { ...MH_AREA, optional: true },
        ],
      }],
    },
    {
      slug: "mortgage", name: "Mortgage deed", article: "Art. 40",
      summary: "With possession: area conveyance rate on the amount secured. Without: 0.3% capped at ₹20 lakh.",
      variants: [
        { rule_id: "MH-ART40a-mortgage-with-possession", label: "Possession given / agreed", fields: [money("amount_secured", "Amount secured"), MH_AREA] },
        { rule_id: "MH-ART40b-mortgage-without-possession", label: "Possession not given", fields: [money("amount_secured", "Amount secured")] },
      ],
    },
    {
      slug: "works-service", name: "Works contract / service agreement", article: "Art. 63 / 5(h)(B)",
      summary: "The ~495× fork: works contracts are ad valorem (capped ₹25 lakh); a pure service agreement is ₹100.",
      variants: [
        { rule_id: "MH-ART63-works-contract", label: "Works contract", fields: [money("contract_value", "Contract value")] },
        { rule_id: "MH-ART5hB-service-agreement", label: "Service agreement", fields: [] },
      ],
    },
    {
      slug: "partnership", name: "Partnership / LLP", article: "Art. 47",
      summary: "₹500 up to ₹50,000 contribution; else 1% capped at ₹15,000. Expressly includes LLPs.",
      variants: [
        { rule_id: "MH-ART47-partnership", label: "Partnership deed", fields: [money("share_contribution", "Cash share contribution")] },
        { rule_id: "MH-ART47-llp", label: "LLP agreement", fields: [money("share_contribution", "Cash share contribution")] },
      ],
    },
    {
      slug: "moa", name: "Memorandum of association", article: "Art. 39",
      summary: "0.2% of share capital, min ₹1,000, capped at ₹50 lakh.",
      variants: [{
        rule_id: "MH-ART39-moa", label: "MOA",
        fields: [
          money("share_capital", "Share capital"),
          fact("accompanied_by_aoa", "Accompanied by AoA?", [{ value: "yes", label: "Yes — flat ₹1,000" }, { value: "no", label: "No — ad valorem" }]),
        ],
      }],
    },
    {
      slug: "bonds", name: "Indemnity / security bond", article: "Arts. 35 & 54",
      summary: "Indemnity: flat ₹500. Security/surety bond: 0.5% capped at ₹10 lakh.",
      variants: [
        { rule_id: "MH-ART35-indemnity-bond", label: "Indemnity bond", fields: [] },
        { rule_id: "MH-ART54-security-bond", label: "Security / surety bond", fields: [money("amount_secured", "Amount secured")] },
      ],
    },
    {
      slug: "poa", name: "Power of attorney", article: "Art. 48",
      summary: "Flat ₹500. Developer POAs and POA-for-consideration-to-sell take the conveyance rate — classify first.",
      variants: [{ rule_id: "MH-ART48-poa", label: "POA (clauses a–e, h)", fields: [] }],
    },
    {
      slug: "affidavit", name: "Affidavit", article: "Art. 4",
      summary: "Flat ₹100.",
      variants: [{ rule_id: "MH-ART4-affidavit", label: "Affidavit", fields: [] }],
    },
    {
      slug: "share-transfer", name: "Share transfer (physical)", article: "Union Art. 62",
      summary: "Union law: 0.015% since 1 July 2020; 0.25% before. Identical in all states.",
      variants: [{ rule_id: "MH-share-transfer", label: "Transfer of shares (SH-4)", fields: [money("consideration", "Consideration")] }],
    },
  ],

  KA: [
    {
      slug: "conveyance", name: "Conveyance / Sale deed", article: "Art. 20",
      summary: "5% + 10% infrastructure cess + local surcharge (≈5.6% urban). First-sale flats get 2–3% bands.",
      variants: [{
        rule_id: "KA-ART20-conveyance", label: "Sale of property",
        fields: [
          money("market_value", "Market value (guidance value)"),
          fact("first_sale_flat", "First sale of a flat/apartment?", [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]),
          KA_AREA_SURCHARGE,
        ],
      }],
    },
    {
      slug: "gift", name: "Gift deed", article: "Art. 28",
      summary: "Family gifts are fixed ₹5,000/₹3,000/₹1,000 by area; others pay the conveyance rate.",
      variants: [{
        rule_id: "KA-ART28-gift", label: "Gift of property",
        fields: [
          money("market_value", "Market value"),
          fact("gift_relation_ka", "Donee relationship", [
            { value: "family", label: "Family (father/mother/spouse/child/daughter-in-law/sibling/grandchild)" },
            { value: "other", label: "Other donee" },
          ]),
          fact("area_type", "Property location", [
            { value: "bbmp_bmrda_city_corp", label: "BBMP / BMRDA / City Corporation" },
            { value: "town_municipal_town_panchayat", label: "Town Municipal Council / Town Panchayat" },
            { value: "rural", label: "Other areas" },
          ], "Determines the fixed family-gift amount"),
        ],
      }],
    },
    {
      slug: "lease", name: "Lease / leave & license", article: "Art. 30",
      summary: "0.5%–3% of (rent + premium + advances) by term; beyond 30 years, the conveyance rate.",
      variants: [{
        rule_id: "KA-ART30-lease", label: "Lease / agreement to let",
        fields: [
          months("term_months", "Term (months)"),
          money("avg_annual_rent", "Average annual rent"),
          money("premium", "Premium / fine (0 if none)"),
          money("fine", "Fine (0 if none)"),
          money("money_advanced", "Money advanced / security deposit (0 if none)", "Includes refundable deposits per the Explanation"),
          money("market_value", "Market value (only if term exceeds 30 years)", undefined, true),
          fact("property_use", "Property use", [
            { value: "residential", label: "Residential" },
            { value: "commercial", label: "Commercial / industrial" },
          ]),
        ],
      }],
    },
    {
      slug: "mortgage", name: "Mortgage / hypothecation", article: "Art. 34",
      summary: "With possession: 5% conveyance rate. Without: 0.5%. Hypothecation: 0.1–0.2% capped ₹10 lakh.",
      variants: [
        { rule_id: "KA-ART34a-mortgage-with-possession", label: "Possession given / agreed", fields: [money("amount_secured", "Amount secured")] },
        { rule_id: "KA-ART34b-mortgage-without-possession", label: "Possession not given", fields: [money("amount_secured", "Amount secured")] },
        { rule_id: "KA-ART34d-hypothecation", label: "Hypothecation of movables", fields: [money("amount_secured", "Loan amount")] },
      ],
    },
    {
      slug: "partnership", name: "Partnership / LLP", article: "Arts. 40 & 40A",
      summary: "Partnership: ₹500/₹2,000. LLP: ₹1,000 + ₹500 per ₹5 lakh slab over ₹10 lakh, capped ₹10 lakh.",
      variants: [
        { rule_id: "KA-ART40-partnership", label: "Partnership deed", fields: [money("capital", "Capital")] },
        { rule_id: "KA-ART40A-llp", label: "LLP agreement / conversion", fields: [money("capital", "Capital")] },
      ],
    },
    {
      slug: "bonds", name: "Indemnity / security bond", article: "Arts. 29 & 47",
      summary: "0.5% up to ₹1,000; flat ₹200 above.",
      variants: [
        { rule_id: "KA-ART29-indemnity-bond", label: "Indemnity bond", fields: [money("amount_secured", "Amount of indemnity")] },
        { rule_id: "KA-ART47-security-bond", label: "Security / surety bond", fields: [money("amount_secured", "Amount secured")] },
      ],
    },
    {
      slug: "poa", name: "Power of attorney", article: "Art. 41",
      summary: "₹100 for the common cases. Developer / for-consideration POAs take higher rates — classify first.",
      variants: [{ rule_id: "KA-ART41-poa", label: "POA (clauses a–c)", fields: [] }],
    },
    {
      slug: "affidavit", name: "Affidavit", article: "Art. 4",
      summary: "Flat ₹20.",
      variants: [{ rule_id: "KA-ART4-affidavit", label: "Affidavit", fields: [] }],
    },
    {
      slug: "works-service", name: "Works contract / service agreement", article: "Art. 5(j)",
      summary: "Both ₹200 in Karnataka — duty-neutral, unlike Maharashtra.",
      variants: [
        { rule_id: "KA-ART5j-works-contract", label: "Works contract", fields: [] },
        { rule_id: "KA-ART5j-service-agreement", label: "Service agreement", fields: [] },
      ],
    },
    {
      slug: "share-transfer", name: "Share transfer (physical)", article: "Union Art. 62",
      summary: "Union law: 0.015% since 1 July 2020; 0.25% before. Identical in all states.",
      variants: [{ rule_id: "KA-share-transfer", label: "Transfer of shares (SH-4)", fields: [money("consideration", "Consideration")] }],
    },
  ],
};

export function findInstrument(state: "DL" | "MH" | "KA", slug: string) {
  return CATALOG[state].find((i) => i.slug === slug);
}
