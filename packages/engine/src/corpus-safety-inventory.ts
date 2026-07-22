/**
 * Deterministic disposition ledger for uncertainty language in the executable
 * corpus. Keys are stable object/version/field identifiers, never file offsets.
 *
 * The paired corpus-safety test scans every non-pending prose field for these
 * terms and requires an exact key match. An amount-affecting legal-review item
 * must name the machine refusal that keeps the unresolved path closed.
 */
export const CORPUS_DOUBT_PATTERN =
  /\b(?:pending(?:_verification)?|assum(?:e|ed|es|ing|ption)s?|confirm(?:ed|ation|s|ing)?|unverified)\b/i;

export type CorpusSafetyDisposition =
  | {
      kind: "pending_refusal" | "pending_warning";
      controls: readonly string[];
      issue: string;
    }
  | {
      kind: "legal_review";
      controls: readonly string[];
      issue: string;
    }
  | {
      kind: "non_amount_affecting";
      reason: string;
    };

export interface CorpusSafetyInventoryEntry {
  key: string;
  dispositions: readonly CorpusSafetyDisposition[];
}

const refusal = (controls: string | readonly string[], issue: string): CorpusSafetyDisposition => ({
  kind: "pending_refusal",
  controls: typeof controls === "string" ? [controls] : controls,
  issue,
});

const warning = (controls: string | readonly string[], issue: string): CorpusSafetyDisposition => ({
  kind: "pending_warning",
  controls: typeof controls === "string" ? [controls] : controls,
  issue,
});

const review = (controls: string | readonly string[], issue: string): CorpusSafetyDisposition => ({
  kind: "legal_review",
  controls: typeof controls === "string" ? [controls] : controls,
  issue,
});

const excluded = (reason: string): CorpusSafetyDisposition => ({
  kind: "non_amount_affecting",
  reason,
});

const entry = (
  key: string,
  ...dispositions: readonly CorpusSafetyDisposition[]
): CorpusSafetyInventoryEntry => ({ key, dispositions });

export const CORPUS_SAFETY_INVENTORY: readonly CorpusSafetyInventoryEntry[] = [
  entry(
    "charging:DL-charging@2015-01-01:notes_for_reviewer",
    refusal(
      "charging:DL-charging@2015-01-01:s4.pending_verification[0]",
      "The unproved Delhi s.4 nominal amount refuses only s.4; independently sourced s.5/s.6 remain callable.",
    ),
  ),
  entry(
    "tree:DL-lease-vs-leave-license@2015-01-01:notes_for_reviewer",
    refusal(
      "tree:DL-lease-vs-leave-license@2015-01-01:pending_verification[0]",
      "The unproved leave-and-licence terminal is branch-scoped and refuses.",
    ),
  ),
  entry(
    "tree:DL-works-vs-service@2015-01-01:notes_for_reviewer",
    refusal(
      [
        "tree:DL-works-vs-service@2015-01-01:pending_verification[0]",
        "tree:DL-works-vs-service@2015-01-01:pending_verification[1]",
      ],
      "Both residual terminals refuse until current notification history and displacement questions are proved.",
    ),
  ),
  entry(
    "modifier:DL-transfer-duty-sale@2015-01-01:version.source.quoted_text",
    warning(
      "modifier:DL-transfer-duty-sale@2015-01-01:pending_verification[0]",
      "The verified 5% joint total remains available, with the unsourced component allocation emitted as a warning.",
    ),
  ),
  entry(
    "modifier:DL-transfer-duty-sale@2023-07-10:notes_for_reviewer",
    warning(
      "modifier:DL-transfer-duty-sale@2023-07-10:pending_verification[0]",
      "At or below the threshold the verified 5% joint total remains available, with a component-allocation warning.",
    ),
  ),
  entry(
    "modifier:DL-transfer-duty-sale-hike@2023-07-10:notes_for_reviewer",
    refusal(
      "modifier:DL-transfer-duty-sale-hike@2023-07-10:pending_verification[0]",
      "Joint purchases above Rs 25 lakh refuse from the first day of the hike.",
    ),
  ),
  entry(
    "modifier:DL-transfer-duty-gift@2023-07-10:notes_for_reviewer",
    review(
      "rule:DL-ART33-gift@2015-01-01:pending_verification[0]",
      "The gift-notification scope remains a legal-review item; the parent gift rule refuses every total.",
    ),
  ),
  entry(
    "modifier:DL-transfer-duty-gift-hike@2023-07-10:notes_for_reviewer",
    refusal(
      "modifier:DL-transfer-duty-gift-hike@2023-07-10:pending_verification[0]",
      "The post-hike joint-donee cell has its own scoped refusal in addition to the parent gift refusal.",
    ),
  ),
  entry(
    "modifier:DL-transfer-duty-mwp@2015-01-01:notes_for_reviewer",
    review(
      "rule:DL-ART40a-mortgage-with-possession@2015-01-01:pending_verification[0]",
      "Mortgage transfer-duty base and gender scope remain unresolved; the parent rule refuses.",
    ),
  ),
  entry(
    "modifier:DL-transfer-duty-mwp@2023-07-10:notes_for_reviewer",
    review(
      "rule:DL-ART40a-mortgage-with-possession@2015-01-01:pending_verification[0]",
      "The unchanged-rate mortgage modifier inherits the unresolved base and gender review; the parent refuses.",
    ),
  ),
  entry(
    "modifier:DL-transfer-duty-mwp-hike@2023-07-10:notes_for_reviewer",
    review(
      "rule:DL-ART40a-mortgage-with-possession@2015-01-01:pending_verification[0]",
      "The post-hike mortgage modifier remains closed by the broader parent-rule refusal.",
    ),
  ),
  entry(
    "modifier:DL-transfer-duty-ats@2023-07-10:notes_for_reviewer",
    review(
      "rule:DL-ART23A-ats-part-performance@2015-01-01:pending_verification[0]",
      "The threshold-base question remains unresolved; the agreement-to-sell parent refuses.",
    ),
  ),
  entry(
    "penalty:DL-penalty@2015-01-01:version.source.quoted_text",
    refusal(
      "penalty:DL-penalty@2015-01-01:pending_verification[0]",
      "The unproved Delhi-applicable penalty text refuses deficit results.",
    ),
  ),
  entry(
    "penalty:DL-penalty@2015-01-01:notes_for_reviewer",
    refusal(
      "penalty:DL-penalty@2015-01-01:pending_verification[0]",
      "The range and minimum remain under the same regime-level refusal.",
    ),
  ),
  entry(
    "rule:DL-ART4-affidavit@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:DL-ART4-affidavit@2015-01-01:pending_verification[0]",
      "Unclassified exemption purposes refuse before the fixed amount can be returned.",
    ),
  ),
  entry(
    "rule:DL-ART5c-agreement-to-sell@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:DL-ART5c-agreement-to-sell@2015-01-01:pending_verification[0]",
      "The unsupported residual no-possession route refuses globally.",
    ),
  ),
  entry(
    "rule:DL-ART23-conveyance@2015-01-01:notes_for_reviewer",
    warning(
      "rule:DL-ART23-conveyance@2015-01-01:pending_verification[0]",
      "The verified joint total is preserved while its stamp/transfer component split is explicitly provisional.",
    ),
    review(
      [
        "rule:DL-ART35-lease@2015-01-01:pending_verification[0]",
        "rule:DL-ART40a-mortgage-with-possession@2015-01-01:pending_verification[0]",
      ],
      "Non-purchase cross-reference category treatment remains under legal review; affected lease/mortgage paths stay closed.",
    ),
  ),
  entry(
    "rule:DL-ART48-gpa@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:DL-ART48-gpa@2015-01-01:pending_verification[0]",
      "Sale-authority, clause, and person-count uncertainty refuses the flat common-case amount.",
    ),
  ),
  entry(
    "rule:DL-ART33-gift@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:DL-ART33-gift@2015-01-01:pending_verification[0]",
      "Municipal scope, joint-donee, and family-concession uncertainty refuse every gift total.",
    ),
  ),
  entry(
    "rule:DL-ART35-lease@2015-01-01:notes_for_reviewer",
    refusal(
      [
        "rule:DL-ART35-lease@2015-01-01:pending_verification[0]",
        "rule:DL-ART35-lease@2015-01-01:pending_verification[1]",
      ],
      "The ambiguous long-term band and unsupported perpetuity tail are separately scoped refusals.",
    ),
  ),
  entry(
    "rule:DL-leave-and-license@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:DL-leave-and-license@2015-01-01:pending_verification[0]",
      "Unproved Delhi leave-and-licence treatment refuses the rule.",
    ),
  ),
  entry(
    "rule:DL-ART40a-mortgage-with-possession@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:DL-ART40a-mortgage-with-possession@2015-01-01:pending_verification[0]",
      "Municipal base, gender, and hike scope refuse the mortgage total.",
    ),
  ),
  entry(
    "rule:DL-ART46-partnership@2015-01-01:version.source.quoted_text",
    refusal(
      "rule:DL-ART46-partnership@2015-01-01:pending_verification[0]",
      "The column-slipped low-capital cell refuses at Rs 500 and below.",
    ),
  ),
  entry(
    "rule:DL-ART46-partnership@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:DL-ART46-partnership@2015-01-01:pending_verification[0]",
      "The same low-capital legal-review item is branch-scoped in machine data.",
    ),
  ),
  entry(
    "rule:DL-llp-agreement@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:DL-llp-agreement@2015-01-01:pending_verification[0]",
      "Practice-based LLP classification refuses globally.",
    ),
  ),
  entry(
    "rule:DL-ART62-share-transfer@2020-07-01:notes_for_reviewer",
    warning(
      "rule:DL-ART62-share-transfer@2020-07-01:pending_verification[0]",
      "Payer identity does not change the computed amount and is emitted as a warning.",
    ),
  ),
  entry(
    "rule:DL-ART48-spa@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:DL-ART48-spa@2015-01-01:pending_verification[0]",
      "Registration-only and other POA clauses refuse the flat single-transaction amount.",
    ),
  ),
  entry(
    "rule:DL-works-contract@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:DL-works-contract@2015-01-01:pending_verification[0]",
      "The prose-only negative inference about more-specific entries now refuses the rule.",
    ),
  ),
  entry(
    "modifier:KA-infra-cess-gift@2016-04-01:version.source.quoted_text",
    review(
      "rule:KA-ART28-gift@2016-04-01:pending_verification[0]",
      "Family-gift cess scope remains unresolved; the parent gift rule refuses all totals.",
    ),
  ),
  entry(
    "modifier:KA-local-surcharge@2016-04-01:notes_for_reviewer",
    refusal(
      "modifier:KA-local-surcharge@2016-04-01:pending_verification[0]",
      "Secondary-only rate, direction, base, and scope now refuse every applied surcharge.",
    ),
  ),
  entry(
    "rule:KA-ART5j-works-contract@2016-04-01:notes_for_reviewer",
    refusal(
      "rule:KA-ART5j-works-contract@2016-04-01:pending_verification[0]",
      "Potentially displaced residual treatment refuses.",
    ),
  ),
  entry(
    "rule:KA-ART28-gift@2016-04-01:notes_for_reviewer",
    refusal(
      "rule:KA-ART28-gift@2016-04-01:pending_verification[0]",
      "Both family-cess and local-surcharge scope are amount-affecting, so all gift totals refuse.",
    ),
  ),
  entry(
    "rule:KA-ART34d-hypothecation@2016-04-01:notes_for_reviewer",
    refusal(
      "rule:KA-ART34d-hypothecation@2016-04-01:pending_verification[0]",
      "The unmodelled term-loan limb and current stale formula refuse.",
    ),
  ),
  entry(
    "rule:KA-share-transfer@2020-07-01:notes_for_reviewer",
    excluded("The matched payer caveat does not change the amount; the unrelated current state-amendment scope has its own refusal."),
  ),
  entry(
    "tree:MH-lease-vs-leave-license@2017-09-07:nodes.q_interest.legal_test",
    excluded("Lexical false positive: 'confirms a lease' states the legal test and does not express uncertainty."),
  ),
  entry(
    "modifier:MH-metro-cess@2022-04-01:notes_for_reviewer",
    refusal(
      "modifier:MH-metro-cess@2022-04-01:pending_verification[0]",
      "Unsourced notification, city list, and instrument scope refuse the modifier.",
    ),
  ),
  entry(
    "modifier:MH-women-residential-concession@2021-04-01:notes_for_reviewer",
    refusal(
      "modifier:MH-women-residential-concession@2021-04-01:pending_verification[0]",
      "Purchaser composition, instrument scope, and currency uncertainty refuse the concession.",
    ),
  ),
  entry(
    "rule:MH-ART4-affidavit@2015-01-01:version.source.quoted_text",
    excluded("Lexical false positive: 'confirmed by him on oath' is statutory instrument language, not a corpus doubt."),
  ),
  entry(
    "rule:MH-ART25-conveyance@2017-09-07:version.source.quoted_text",
    refusal(
      [
        "rule:MH-ART25-conveyance@2017-09-07:pending_verification[0]",
        "rule:MH-ART25-conveyance@2017-09-07:pending_verification[1]",
        "modifier:MH-metro-cess@2022-04-01:pending_verification[0]",
      ],
      "Omitted local levies and both active metro-surcharge eras are covered by locality/date-scoped refusals.",
    ),
  ),
  entry(
    "rule:MH-ART25-conveyance@2017-09-07:notes_for_reviewer",
    refusal(
      [
        "rule:MH-ART25-conveyance@2017-09-07:pending_verification[0]",
        "rule:MH-ART25-conveyance@2017-09-07:pending_verification[1]",
        "modifier:MH-metro-cess@2022-04-01:pending_verification[0]",
      ],
      "Metro/LBT uncertainty refuses in either active surcharge era unless facts establish an unaffected location.",
    ),
  ),
  entry(
    "rule:MH-ART34-gift@2017-09-07:notes_for_reviewer",
    refusal(
      [
        "rule:MH-ART34-gift@2017-09-07:pending_verification[0]",
        "rule:MH-ART34-gift@2017-09-07:pending_verification[1]",
        "rule:MH-ART34-gift@2017-09-07:pending_verification[2]",
      ],
      "Relation/preference facts and omitted metro/local levies are separately refused.",
    ),
  ),
  entry(
    "rule:MH-ART34-gift@2015-01-01:version.source.quoted_text",
    refusal(
      "rule:MH-ART34-gift@2015-01-01:pending_verification[2]",
      "The conflicting January/April 2015 Rs 200-proviso boundary is closed through the day before official publication.",
    ),
  ),
  entry(
    "rule:MH-ART34-gift@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:MH-ART34-gift@2015-01-01:pending_verification[2]",
      "Close-family residential/agricultural cases in the disputed pre-publication interval refuse.",
    ),
  ),
  entry(
    "rule:MH-ART48-poa@2015-01-01:version.source.quoted_text",
    refusal(
      "rule:MH-ART48-poa@2015-01-01:pending_verification[1]",
      "The conflicting April/May 2015 Article 48 boundary refuses the complete disputed interval.",
    ),
  ),
  entry(
    "rule:MH-ART48-poa@2015-05-24:version.source.quoted_text",
    refusal(
      "rule:MH-ART48-poa@2015-01-01:pending_verification[1]",
      "The current era starts only after the disputed interval, which is closed by the preceding version's refusal.",
    ),
  ),
  entry(
    "rule:MH-ART36-lease@2015-01-01:notes_for_reviewer",
    refusal(
      [
        "rule:MH-ART36-lease@2015-01-01:pending_verification[0]",
        "rule:MH-ART36-lease@2015-01-01:pending_verification[1]",
      ],
      "Incomplete value scope and omitted local levy scope are branch/fact-scoped refusals.",
    ),
  ),
  entry(
    "rule:MH-ART36A-leave-license@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:MH-ART36A-leave-license@2015-01-01:pending_verification[0]",
      "Unconfirmed multi-year payment treatment refuses the affected path.",
    ),
  ),
  entry(
    "rule:MH-ART40a-mortgage-with-possession@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:MH-ART40a-mortgage-with-possession@2015-01-01:pending_verification[0]",
      "Unmodelled metro-cess scope refuses affected mortgages.",
    ),
  ),
  entry(
    "rule:MH-share-transfer@2020-07-01:notes_for_reviewer",
    warning(
      "rule:MH-share-transfer@2020-07-01:pending_verification[0]",
      "Payer identity does not change the amount and remains an explicit warning.",
    ),
  ),
  entry(
    "rule:MH-ART63-works-contract@2015-04-24:notes_for_reviewer",
    refusal(
      "rule:MH-ART63-works-contract@2015-04-24:pending_verification[0]",
      "The historical cap interpretation is refused only where the encoded total ceiling can bind.",
    ),
  ),
  entry(
    "rule:MH-ART5hB-service-agreement@2015-01-01:notes_for_reviewer",
    refusal(
      "rule:MH-ART5hB-service-agreement@2015-01-01:pending_verification[0]",
      "Specific-clause displacement and uncertain effective history refuse the residual path.",
    ),
  ),
] as const;

export interface CorpusControlCoverageEntry {
  control: string;
  severity: "refuse" | "warn";
  /** Stable test/golden family or fail-closed dependency that exercises the control. */
  coverage: string;
}

const controlGroup = (
  coverage: string,
  controls: readonly string[],
  severity: "refuse" | "warn" = "refuse",
): CorpusControlCoverageEntry[] => controls.map((control) => ({ control, severity, coverage }));

/**
 * Exact pending-control ledger. The paired test compares this list with the full
 * executable corpus, so adding, removing, or renumbering a control requires an
 * explicit coverage disposition in the same change.
 */
export const CORPUS_CONTROL_COVERAGE: readonly CorpusControlCoverageEntry[] = [
  ...controlGroup("charging.test: Delhi s.4 ancillary-duty refusal", [
    "charging:DL-charging@2015-01-01:s4.pending_verification[0]",
  ]),
  ...controlGroup("corpus-safety: Delhi joint transfer-duty post-hike refusals", [
    "modifier:DL-transfer-duty-ats-hike@2023-07-10:pending_verification[0]",
    "modifier:DL-transfer-duty-gift-hike@2023-07-10:pending_verification[0]",
    "modifier:DL-transfer-duty-sale-hike@2023-07-10:pending_verification[0]",
  ]),
  ...controlGroup("dependency: mortgage parent refuses and its input contract excludes transferee_category", [
    "modifier:DL-transfer-duty-mwp-hike@2023-07-10:pending_verification[0]",
  ]),
  ...controlGroup("corpus-safety: Delhi verified joint-total component warnings", [
    "modifier:DL-transfer-duty-sale@2015-01-01:pending_verification[0]",
    "modifier:DL-transfer-duty-sale@2023-07-10:pending_verification[0]",
    "rule:DL-ART23-conveyance@2015-01-01:pending_verification[0]",
  ], "warn"),
  ...controlGroup("golden/KA: local surcharge and gift eligibility refusals", [
    "modifier:KA-local-surcharge@2016-04-01:pending_verification[0]",
    "rule:KA-ART28-gift@2016-04-01:pending_verification[0]",
  ]),
  ...controlGroup("golden/MH + corpus-safety: metro and women modifier refusals", [
    "modifier:MH-metro-cess@2022-04-01:pending_verification[0]",
    "modifier:MH-women-residential-concession@2021-04-01:pending_verification[0]",
  ]),
  ...controlGroup("engine.test/goldens: jurisdiction penalty refusals", [
    "penalty:DL-penalty@2015-01-01:pending_verification[0]",
    "penalty:KA-penalty@2015-01-01:pending_verification[0]",
    "penalty:MH-penalty@2015-01-01:pending_verification[0]",
    "penalty:MH-penalty@2024-07-31:pending_verification[0]",
  ]),
  ...controlGroup("corpus-safety + golden/DL: mortgage and ATS refusals", [
    "rule:DL-ART23A-ats-part-performance@2015-01-01:pending_verification[0]",
    "rule:DL-ART40a-mortgage-with-possession@2015-01-01:pending_verification[0]",
    "rule:DL-ART40b-mortgage-without-possession@2015-01-01:pending_verification[0]",
    "rule:DL-ART5c-agreement-to-sell@2015-01-01:pending_verification[0]",
  ]),
  ...controlGroup("golden/DL: gift, lease, affidavit, POA, loan, and residual refusals", [
    "rule:DL-ART33-gift@2015-01-01:pending_verification[0]",
    "rule:DL-ART35-lease@2015-01-01:pending_verification[0]",
    "rule:DL-ART35-lease@2015-01-01:pending_verification[1]",
    "rule:DL-ART4-affidavit@2015-01-01:pending_verification[0]",
    "rule:DL-ART48-gpa@2015-01-01:pending_verification[0]",
    "rule:DL-ART48-spa@2015-01-01:pending_verification[0]",
    "rule:DL-ART6-loan-hypothecation@2015-01-01:pending_verification[0]",
    "rule:DL-leave-and-license@2015-01-01:pending_verification[0]",
    "rule:DL-service-agreement@2015-01-01:pending_verification[0]",
    "rule:DL-works-contract@2015-01-01:pending_verification[0]",
  ]),
  ...controlGroup("corpus-safety + golden/DL: partnership boundary and LLP classification", [
    "rule:DL-ART46-partnership@2015-01-01:pending_verification[0]",
    "rule:DL-llp-agreement@2015-01-01:pending_verification[0]",
  ]),
  ...controlGroup("crossstate/goldens: Delhi share-transfer payer warning", [
    "rule:DL-ART62-share-transfer@2020-07-01:pending_verification[0]",
  ], "warn"),
  ...controlGroup("golden/KA: current stale-rule refusals", [
    "rule:KA-ART20-rate@2016-04-01:pending_verification[0]",
    "rule:KA-ART20-conveyance@2016-04-01:pending_verification[0]",
    "rule:KA-ART30-lease@2016-04-01:pending_verification[0]",
    "rule:KA-ART34a-mortgage-with-possession@2016-04-01:pending_verification[0]",
    "rule:KA-ART34b-mortgage-without-possession@2016-04-01:pending_verification[0]",
    "rule:KA-ART34d-hypothecation@2016-04-01:pending_verification[0]",
    "rule:KA-ART4-affidavit@2016-04-01:pending_verification[0]",
    "rule:KA-ART40-partnership@2016-04-01:pending_verification[0]",
    "rule:KA-ART40A-llp@2016-04-01:pending_verification[0]",
    "rule:KA-ART41-poa@2016-04-01:pending_verification[0]",
    "rule:KA-ART47-security-bond@2016-04-01:pending_verification[0]",
    "rule:KA-ART5j-service-agreement@2016-04-01:pending_verification[0]",
    "rule:KA-ART5j-works-contract@2016-04-01:pending_verification[0]",
    "rule:KA-share-transfer@2020-07-01:pending_verification[0]",
  ]),
  ...controlGroup("charging.test: current Karnataka source-freshness refusals", [
    "charging:KA-charging@2015-01-01:s4.pending_verification[0]",
    "charging:KA-charging@2015-01-01:s5.pending_verification[0]",
    "charging:KA-charging@2015-01-01:s6.pending_verification[0]",
  ]),
  ...controlGroup("golden/MH + corpus-safety: conveyance surcharge eras and LBT", [
    "rule:MH-ART25-conveyance@2017-09-07:pending_verification[0]",
    "rule:MH-ART25-conveyance@2017-09-07:pending_verification[1]",
  ]),
  ...controlGroup("golden/MH + corpus-safety: current Maharashtra policy-remission gates", [
    "modifier:MH-agricultural-loan-remission@2026-01-01:pending_verification[0]",
    "modifier:MH-gcc-policy-remission@2025-11-03:pending_verification[0]",
    "modifier:MH-section9-remission-screen@2015-01-01:pending_verification[0]",
  ]),
  ...controlGroup("golden/MH + corpus-safety: historical/current gift safety branches", [
    "rule:MH-ART34-gift@2015-01-01:pending_verification[0]",
    "rule:MH-ART34-gift@2015-01-01:pending_verification[1]",
    "rule:MH-ART34-gift@2015-01-01:pending_verification[2]",
    "rule:MH-ART34-gift@2017-09-07:pending_verification[0]",
    "rule:MH-ART34-gift@2017-09-07:pending_verification[1]",
    "rule:MH-ART34-gift@2017-09-07:pending_verification[2]",
  ]),
  ...controlGroup("golden/MH: lease, licence, MOA, affidavit, POA, and bond refusals", [
    "rule:MH-ART36-lease@2015-01-01:pending_verification[0]",
    "rule:MH-ART36-lease@2015-01-01:pending_verification[1]",
    "rule:MH-ART36A-leave-license@2015-01-01:pending_verification[0]",
    "rule:MH-ART39-moa@2015-05-24:pending_verification[0]",
    "rule:MH-ART4-affidavit@2015-01-01:pending_verification[0]",
    "rule:MH-ART4-affidavit@2024-10-14:pending_verification[0]",
    "rule:MH-ART48-poa@2015-01-01:pending_verification[0]",
    "rule:MH-ART48-poa@2015-01-01:pending_verification[1]",
    "rule:MH-ART48-poa@2015-05-24:pending_verification[0]",
    "rule:MH-ART54-security-bond@2015-01-01:pending_verification[0]",
    "rule:MH-ART54-security-bond@2015-01-01:pending_verification[1]",
    "rule:MH-ART54-security-bond@2022-01-20:pending_verification[0]",
    "rule:MH-ART54-security-bond@2022-01-20:pending_verification[1]",
  ]),
  ...controlGroup("golden/MH + corpus-safety: mortgage locality and current rate refusals", [
    "rule:MH-ART40a-mortgage-with-possession@2015-01-01:pending_verification[0]",
    "rule:MH-ART40b-mortgage-without-possession@2022-01-20:pending_verification[0]",
  ]),
  ...controlGroup("golden/MH: observable service classification refusals", [
    "rule:MH-ART5hB-service-agreement@2015-01-01:pending_verification[0]",
    "rule:MH-ART5hB-service-agreement@2024-10-14:pending_verification[0]",
  ]),
  ...controlGroup("golden/MH + corpus-safety: works-contract cap refusals", [
    "rule:MH-ART63-works-contract@2015-04-24:pending_verification[0]",
    "rule:MH-ART63-works-contract@2024-10-14:pending_verification[0]",
  ]),
  ...controlGroup("crossstate/goldens: Maharashtra share-transfer payer warning", [
    "rule:MH-share-transfer@2020-07-01:pending_verification[0]",
  ], "warn"),
  ...controlGroup("corpus-safety: classification terminal refusals", [
    "tree:DL-lease-vs-leave-license@2015-01-01:pending_verification[0]",
    "tree:DL-works-vs-service@2015-01-01:pending_verification[0]",
    "tree:DL-works-vs-service@2015-01-01:pending_verification[1]",
  ]),
] as const;
