# StampDraft MVP Source and Coverage Matrix

**Updated:** 2026-07-21
**Scope:** Delhi, Maharashtra, and Karnataka
**Purpose:** Define what StampDraft may eventually answer, what it must currently refuse, and which primary-source work unlocks each path.

Read this with `stampdraft-prd.md`, `HANDOFF.md`, `WATCHDOG-PRD.md`, `WATCHDOG-HANDOFF.md`, and the three state sourcing dossiers.

---

## 1. The accuracy contract

StampDraft should target **at least 80% answer coverage with near-100% conditional correctness**, not 80% correctness across answers it chooses to give.

- **Answer coverage** = supported, fully sourced, verified matters / matters presented by the target beta population.
- **Conditional correctness** = correct outputs / outputs StampDraft chose to provide.
- Unsupported, stale, ambiguous, or incompletely sourced cells must refuse or escalate and therefore do not count as answered.
- No production number is eligible merely because the arithmetic engine can compute it.

As of this document, every `verified_on` value is null and the generated evidence report records **0/115 Watchdog-linked citation dependencies**. Production web computation, memo, filing, and classification paths enforce both founder verification and current immutable evidence, so **every current rule remains blocked from production by design**. Draft engine and golden tooling deliberately permit unmerged versions for testing. The statuses below describe readiness for founder review; they do not authorize production use.

## 2. Status legend

| Status | Meaning |
|---|---|
| **VERIFY** | The encoded structure looks suitable for founder review, but its primary evidence must be current, archived, linked, and reviewed first. |
| **RESTRICT** | Only the expressly stated fact pattern may proceed to review. Other branches must refuse. |
| **REFUSE** | Known stale, wrong, assumption-dependent, or materially incomplete. Do not return a number. |
| **DEFER** | Outside the present MVP release path. |

### Mandatory production gate

A computation may return a production number only when all of the following are true:

1. The top-level rule and every transitive dependency are founder-verified.
2. Every rule, modifier, cross-reference target, charging rule, classification tree, and penalty regime used by the output is free of applicable refusal flags.
3. Every numeric dependency points to an immutable primary-evidence SHA-256 record, with page/paragraph or raw-table location.
4. The relevant source-family sweeps succeeded through the required `audited_through` date.
5. The rule has current-date, boundary, missing-fact, and known-exception tests.
6. Evidence bodies have durable off-device storage and a verified checksum manifest.

Warnings are permitted only for issues that cannot change the number. Any doubt touching the amount, applicable article, base, rate, cap, surcharge, concession, effective date, or payer liability must refuse.

---

## 3. Current corpus snapshot

| State | Active rule versions reported by validator | Golden cases | Lawyer-verified versions | Latest golden execution date | Current source position |
|---|---:|---:|---:|---|---|
| Delhi | 22 | 85 | 0 | 2026-07-21 | Rates drafted; notification history and municipal evidence incomplete |
| Maharashtra | 30 | 124 | 0 | 2026-07-21 | Acts III of 2021, VII of 2022, XXXII of 2024, and IX and XX of 2025 are date-versioned for review; Article 54 and two fail-closed Part IV-B remission screens have exact mechanically validated evidence proposals; both Gazette baselines pass generated promotion, and Part IV-B has one exact early-2021 document gap |
| Karnataka | 17 | 42 | 0 | 2026-07-21 | Consolidated source is stale; many current paths refuse |

The 256/256 golden result proves deterministic agreement with the drafted expectations. It does not independently prove the law.

---

## 4. Source-family coverage

### 4.1 Delhi

| Source family | Needed for | Evidence now | Watchdog state | Gap and required proof | Priority |
|---|---|---|---|---|---|
| Current Delhi Schedule I-A and amendment chain | All Delhi Schedule rates, cross-references, exemptions, historical eras | Official Delhi-hosted central Schedule I plus a secondary Schedule I-A reproduction; the reproduction has a known column-slip defect | No complete source | Obtain a current first-party Schedule I-A or assemble it from Delhi Gazette amendment instruments; archive every instrument and link each encoded article | **P0** |
| Delhi Revenue notification history | Remissions, exemptions, procedural and rate notifications | Current page probe found 10 PDFs across 2 listing URLs; bounded full-pagination discovery and a dated snapshot acquisition adapter are fixture-tested and CLI-wired | Provisional; no live snapshot, historical-completeness proof, or committed acquisition | Run the dated snapshot sweep; establish history coverage independently; record OCR status for scans; repeat with zero additions | **P0** |
| DMC/MCD transfer-duty law and 10-Jul-2023 notification | Sale, gift, mortgage with possession, contract for transfer, perpetual lease | Citations and founder rulings exist, but the primary notification is not in the immutable evidence archive | No registered source family | Add the municipal source; acquire s.147 text and the complete notification; prove instrument scope, bases, threshold, gender/joint treatment, and effective date | **P0** |
| DORIS/property-registration output | Joint rates, mortgage base, registrar-practice reconciliation | Manual references only | No canary | Create fixed, recorded reconciliation scenarios; a portal result is a canary, not the legal source | **P0** |
| Central e-Gazette/MoF/DEA securities material | Physical share transfer from 2020 and historical central rate | Citations exist; no complete Watchdog-backed chain | No source family | Archive Finance Act 2019 provisions, commencement notifications, rate notifications, and relevant official FAQs | **P1** |
| Judgments and classification authorities | Conveyance cross-reference, lease/licence, works/service, transfer-duty scope | Citations in rule text; no immutable judgment corpus | Manual only | Keep a curated, licensed or public first-party judgment set with pinpoint references; monitor later overruling separately from the Gazette Watchdog | **P1** |
| Registration fee table | Property registration adjunct | Researched, not encoded | None | Resolve whether the Rs 50,000 cap survives and obtain current official fee evidence | **DEFER** |

### 4.2 Maharashtra

| Source family | Needed for | Evidence now | Watchdog state | Gap and required proof | Priority |
|---|---|---|---|---|---|
| Maharashtra Act / Schedule spine | All Schedule articles and Act-level sections | Local IGR Schedule PDF current only through 1-Jun-2022; official Acts III of 2021, VII of 2022, XXXII of 2024, and IX and XX of 2025 are pinpointed in the immutable Gazette archive but deliberately unlinked pending the complete chain | Not an accepted current spine | Link a current consolidated spine to all amendments; retain consolidation date as evidence metadata | **P0** |
| e-Gazette Part 8 English Extra-Ordinary | Amendment Acts and ordinances | 1,368 occurrences / 1,361 unique immutable PDFs; 195-document accepted baseline plus complete non-overlapping historical queries from 2015 | Accepted baseline; receipt-bound historical query coverage complete to the 2015 product floor | Review all 422 selected occurrences / 421 blobs, including the 407 enacted-law-title backstop items and two curated generic-title dependency targets, and establish complete amendment/commencement chains before linking evidence | **P0** |
| e-Gazette Part IV-B | Stamp notifications, commencements, concessions, surcharge and remission orders | 5,065 occurrences / 5,030 unique immutable PDFs; accepted 2,575-row baseline; complete 2015–2020 queries; 207/208 early-2021 rows; exact local orders show targeted, retrospective, industrial, housing, logistics, agricultural, and GCC remissions; a shared section 9 screen plus the two broad 2026 policy gates refuse possibly affected paths | Accepted baseline; exact missing 2021-05-28 row is recorded and remains inaccessible | Re-attempt the one exact document; complete review of 107 selected title candidates / 105 blobs; establish complete chains and exact order-scope questionnaires before linking evidence | **P0** |
| Municipal/transport surcharge law | Metro cess, s.149A/s.149B stacking, city coverage, LBT | Partial statutory quotations and secondary corroboration | No complete source family | Archive the municipal Acts, commencement/project notifications, city declarations, abeyance/revival instruments, and LBT instruments; model city and instrument scope explicitly | **P0** |
| IGR publications: Acts, rules, notifications, circulars, valuation, fees | Act/Schedule spine, registration fee, valuation, practice, stamping mode | Official portal registered; a local official Schedule I/II PDF is expressly current only through 1-Jun-2022 | Provisional source-family discovery only | Execute and record publication-section discovery, traverse each family, acquire dated documents, and prove history/currency with repeat runs | **P0** |
| Official calculator/canary | Property-rate reconciliation | Not automated | None | Add fixed scenario reconciliation only after the underlying rules are verified | **P1** |
| Registration fee table | Property registration adjunct | Researched, not encoded | None | Archive and verify the stepped fee table and family-gift exception | **DEFER** |

### 4.3 Karnataka

| Source family | Needed for | Evidence now | Watchdog state | Gap and required proof | Priority |
|---|---|---|---|---|---|
| DPAL base/consolidated Act | Schedule, s.3B, penalties, charging rules | Local official PDF whose newest amendment footnote is Act 55 of 2020 | Known stale | Preserve as historical evidence only; never use its silence to reject later amendments | **P0** |
| DPAL annual Acts and ordinances | Acts 26/2021, 11/2022, 12/2022, 31/2022, 03/2023, 04/2024, 23/2024, 30/2025, 42/2025 | 2025 probe found 77 identifiable Acts and 125 PDFs; direct 2021–2026 traversal, nine-Act gate, CLI full probe, and complete PDF acquisition sweep are fixture-tested | Provisional; no six-year live run or committed acquisition | Execute and record the live sweep, prove the checklist from recorded responses, and repeat with zero additions | **P0** |
| Commencement notifications | Acts whose provisions commence on a notified date, especially Acts 30/2025 and 42/2025 | Not located | No complete source | Locate the official Gazette/department notification source and archive positive commencement evidence; absence cannot be treated as non-commencement | **P0** |
| Karnataka IGR circulars/orders | Current practice, fee tables, registration requirements and clarification | No Watchdog source | None | Add source families by portal shape; archive fee tables and operative circulars separately | **P0** |
| Municipal/local-body surcharge law | Urban/rural surcharge and instrument scope | Secondary corroboration only; no primary section pinned | No source family | Acquire the governing municipal provisions and amendments; verify rate direction, base, territorial classification, and instrument list | **P0** |
| Kaveri/official calculator canary | Property reconciliation | Not automated | None | Add fixed scenario reconciliation after the source-backed rates are verified | **P1** |
| Registration fee table | Property registration adjunct | Parent table not found officially; 2% headline is not universal | None | May require RTI; keep outside production until primary evidence exists | **DEFER** |

### 4.4 Cross-state source families

| Dependency | Current state | Required treatment |
|---|---|---|
| Central Stamp Act amendments and securities regime | Cited but not Watchdog-backed end to end | Add central e-Gazette/Department of Economic Affairs source families and immutable evidence links |
| Court decisions changing classification or validity | Outside Gazette Watchdog | Maintain a separate legal-update workflow; Gazette completeness cannot establish case-law currency |
| Official calculators | Not a source of law and not automated | Use only as anomaly canaries; never silently change a rule to match a portal |
| Secondary trackers | Useful but non-authoritative | Use as discovery/anomaly signals only; require first-party evidence before activation |

---

## 5. Instrument coverage matrix

### 5.1 Delhi

All rows remain globally blocked until founder verification and source freshness are enforced.

| Instrument / rule | Encoded path | Material dependencies and gaps | Review disposition |
|---|---|---|---|
| Conveyance — `DL-ART23-conveyance` | Schedule duty by transferee category plus municipal transfer duty and 2023 threshold | Primary MCD notification not archived; joint component split and joint post-hike treatment unresolved | **RESTRICT** to separately sourced male/female cells; pre-hike and <= Rs 25 lakh joint totals carry component warnings; **REFUSE** joint > Rs 25 lakh and all unsourced categories |
| Gift — `DL-ART33-gift` | Conveyance charge on value plus gift transfer duty | Must prove that the 2023 hike applies to gifts; joint donee and any family concession require evidence | **REFUSE** until notification scope is established; then review non-joint cells |
| Agreement to sell with possession — `DL-ART23A-ats-part-performance` | 90% of conveyance duty plus transfer duty | Transfer-duty scope, 90% base, threshold test, and set-off memo treatment need primary proof | **REFUSE** pending MCD evidence and questionnaire proof; day-before, amendment-day, ambiguous-threshold, current, and missing-input coverage is explicit |
| Agreement to sell without possession — `DL-ART5c-agreement-to-sell` | Fixed Article 5(c) amount | Registrar practice may treat some variants ad valorem; possession fork is high consequence | **REFUSE** until the supported no-possession fact pattern is defined and verified; current neighbouring-route refusal is explicit |
| Lease — `DL-ART35-lease` | Term-banded Bond/Conveyance cross-references | OCR ambiguity in the >30-year band; >100 years/perpetuity incomplete; premium and category treatment need review | **RESTRICT** to verified term bands after a clean primary Schedule; refuse the ambiguous tail |
| Leave and licence — `DL-leave-and-license` | Treated as Article 35 agreement to let | Delhi registrar-practice treatment not positively established for all licences | **REFUSE** until practice and classification boundary are verified |
| Mortgage with possession — `DL-ART40a-mortgage-with-possession` | Conveyance duty on secured amount plus transfer duty | Municipal base, scope, gender treatment, and 2023 hike application are assumptions | **REFUSE** on both sides of the amendment and currently; arithmetic is isolated, and missing base refuses first |
| Mortgage without possession — `DL-ART40b-mortgage-without-possession` | Ad valorem with cap | Collateral/auxiliary-security branch not encoded; current Schedule must be proved | **RESTRICT** to an explicitly confirmed principal mortgage; the collateral neighbour refuses |
| Loan/hypothecation — `DL-ART6-loan-hypothecation` | Tenor-selected rate and cap | Bill-of-exchange accompanying exemption and instrument classification require questions | **RESTRICT** to ordinary standalone agreements after primary verification |
| Indemnity — `DL-ART34-indemnity-bond` | Cross-reference to security bond | Depends on Bond/Security Bond cross-reference chain and correct classification | **VERIFY** after the complete primary chain is linked |
| Guarantee/security bond — `DL-ART57-security-bond` | Small-amount switch to Bond; otherwise fixed | Source is a reproduction and must be replaced or corroborated by a clean primary Schedule | **VERIFY** after primary evidence |
| Partnership — `DL-ART46-partnership` | 1% of capital capped at Rs 5,000 | Known duty-column slip; exact clause (a) amount for capital <= Rs 500 unresolved | **RESTRICT** to capital > Rs 500 after clean primary proof; Rs 500 refuses and Rs 501 is the tested neighbouring formula cell |
| Partnership dissolution — `DL-ART46B-partnership-dissolution` | Fixed amount | Same column-slip source family | **VERIFY** after clean primary proof |
| LLP — `DL-llp-agreement` | Treated as partnership | Classification is practice-based, not tied to an explicit verified Delhi entry | **REFUSE** globally, including where the cross-referenced partnership low-capital cell would also refuse |
| General POA — `DL-ART48-gpa` | Fixed common case | POA-for-sale, consideration, number-of-attorneys, and other clauses can change duty materially | **RESTRICT** only after a clause-selection questionnaire is mandatory |
| Special POA — `DL-ART48-spa` | Fixed single-transaction case | Registration-only clause may carry a different amount | **RESTRICT** only after purpose is explicitly selected |
| Affidavit — `DL-ART4-affidavit` | Fixed amount | Court, enrolment, and pension exemptions not modelled; current Schedule source incomplete | **RESTRICT** to a verified non-exempt affidavit |
| Works contract — `DL-works-contract` | Residual agreement amount | Encoded partly from absence of a specific entry; complete notification history is needed to prove the negative | **REFUSE** until current-source completeness is established |
| Service agreement — `DL-service-agreement` | Article 5 residual/service path | Specific agreement sub-clauses can displace the residual | **RESTRICT** after the questionnaire rules out specific higher entries |
| Physical share transfer — `DL-ART62-share-transfer` | Historical 0.25%; current Union 0.015% | Central evidence chain must be archived; payer is contested but does not change amount | **VERIFY** amount after central-source acquisition; payer remains a non-amount caveat |
| Deficit/penalty — `DL-penalty` | Discretionary range | Delhi-specific amendments and practical/statutory minimum not verified | **REFUSE** |
| Several instruments / distinct matters / multiple descriptions — `DL-charging` | Sections 4-6 | Delhi s.4 nominal duty may have been amended; the section carries a machine-readable refusal | **REFUSE** s.4; review s.5/s.6 only after current Act proof |

### 5.2 Maharashtra

| Instrument / rule | Encoded path | Material dependencies and gaps | Review disposition |
|---|---|---|---|
| Conveyance — `MH-ART25-conveyance` | Area-based Schedule rate, women concession, metro modifier | Metro city list and 1%/2% stacking unresolved; LBT incomplete; section 9 includes targeted/project remissions, and the GCC Policy can affect Article 25 instruments from 3-Nov-2025 | **RESTRICT** to explicit non-metro/non-LBT cells without concession and with no other remission identified; **REFUSE** active metro, LBT-uncertain, concession, GCC, and other claimed/possible section 9 cells |
| Gift — `MH-ART34-gift` | Fixed close-family, 3% family, or conveyance rate | Metro/LBT treatment is absent; relation/property-use precedence must be confirmed | **RESTRICT** all three relationship branches to explicit non-metro/non-LBT locations; **REFUSE** metro, LBT-uncertain, or missing-relation cells |
| Lease — `MH-ART36-lease` | Conveyance rate on term percentage of market value | User-supplied market-value concept must include required premium/deposit treatment; LBT and area effects need proof; targeted, retrospective, logistics, and GCC orders can remit Article 36 instruments | **RESTRICT** after current Schedule, locality, and order-scope questions are verified; every claimed/possible section 9 or GCC cell refuses |
| Leave and licence — `MH-ART36A-leave-license` | 0.25% formula up to 60 months, then lease | Deposit classification and >60-month cross-reference require verified inputs; the GCC Policy remission can affect Article 36A instruments from 3-Nov-2025 | **VERIFY** the <=60-month standard path only after current-source and GCC order-scope review; eligible/uncertain GCC cells and the unsupported tail refuse |
| Memorandum of association — `MH-ART39-moa` | Share-capital rate with minimum/cap and AoA branch | Current Act sweep and exact accompanied-by-AoA facts | **VERIFY** after current-source review |
| POA — `MH-ART48-poa` | Fixed common clauses | Consideration/sale/developer clauses route to conveyance and are not represented by the flat path | **RESTRICT** to verified clauses through a mandatory questionnaire |
| Mortgage with possession — `MH-ART40a-mortgage-with-possession` | Conveyance rate on amount secured | Metro surcharge reaches only specified mortgage types; subtype matters; general section 9, GCC Policy, and agricultural/crop-loan orders can remit Article 40 duty | **RESTRICT** to explicit non-usufructuary, non-metro, non-LBT cells with no remission identified; **REFUSE** metro/uncertain subtype, omitted-levy, and every claimed/possible remission cell |
| Mortgage without possession — `MH-ART40b-mortgage-without-possession` | Date-versioned 0.5% baseline, then the 0.1%/0.3% table with Rs 10 lakh and Rs 20 lakh ceilings | Exact Acts III of 2021 and VII of 2022 establish the two current-era boundaries; the latter adds the Rs 50 lakh consortium ceiling; scope questions cover general section 9, GCC Policy, and agricultural/crop-loan remissions | **RESTRICT** to a questionnaire-proved ordinary or consortium scope with no remission identified; every claimed/possible order scope refuses; verify the complete chain before production |
| Indemnity — `MH-ART35-indemnity-bond` | Fixed amount with historical era | Requires current Act sweep but no known current error recorded | **VERIFY** after current-source review |
| Guarantee/security bond — `MH-ART54-security-bond` | Date-versioned historical 0.5% and current 0.1%/0.3% table, Article 40 proviso, and statutory exemptions | Exact Act VII of 2022 pages 3-4 are encoded; historical exemptions remain refused; current exemption/proviso and GCC Policy or agricultural/crop-loan remission scope must be known | **RESTRICT** to an exact listed scope expressly outside both remission orders; every uncertain or eligible remission answer refuses; verify the complete source chain before production |
| Partnership — `MH-ART47-partnership` | Date-versioned 1% rate; cap rises from Rs 15,000 to Rs 50,000 on 14-Oct-2024 | Exact Act IX of 2025 pinpoint is encoded; complete baseline/amendment chain, evidence link, and founder review remain open | **VERIFY** the new era after chain review; production stays blocked meanwhile |
| LLP — `MH-ART47-llp` | Date-versioned partnership cross-reference | Exact amended cap is inherited by the new LLP era; chain and founder review remain open | **VERIFY** with the partnership dependency |
| Affidavit — `MH-ART4-affidavit` | Date-versioned fixed amount: Rs 100 then Rs 500 from 14-Oct-2024 | Exact Act IX pinpoint is encoded; statutory exemptions remain observable-fact gated | **RESTRICT** to an ordinary non-exempt affidavit; verify the source chain before production |
| Works contract — `MH-ART63-works-contract` | Rs 5 lakh threshold and 0.3% marginal rate from 14-Oct-2024 | Exact Act IX pinpoint is encoded; whether the existing Rs 25 lakh ceiling applies to total duty or only the percentage component remains material only when it can bind | **RESTRICT** to non-cap-binding values after source review; **REFUSE** every cap-binding value |
| Service agreement — `MH-ART5hB-service-agreement` | Residual fixed amount rises from Rs 100 to Rs 500 on 14-Oct-2024 | Exact Act IX pinpoint is encoded; specific Article 5 branches can still displace the residual | **RESTRICT** to questionnaire-proved residual agreements; affirmative or uncertain competing paths refuse |
| Physical share transfer — `MH-share-transfer` | Historical state/central rate and current Union rate | Central evidence chain and payer treatment | **VERIFY** amount after central-source acquisition |
| Deficit/penalty — `MH-penalty` | Sections 31/34 use 2% per month with a four-times cap; section 39 is a distinct route and changed on 31-Jul-2024 to 1% for registered instruments / 2% otherwise | Exact Act XXXII of 2024 boundary is encoded, but the product does not collect procedural route or registration status | **REFUSE** every route-free penalty output until the form and result contract represent the applicable branch |
| Sections 4-6 — `MH-charging` | State-specific nominal duty and transaction scope | Exact Act XX of 2025 changes the section 4 ancillary-instrument amount from Rs 100 to Rs 500 on 1-Apr-2025; sections 5 and 6 are unchanged by that Act | **VERIFY** the two append-only eras after complete-chain review; the 31-Mar/1-Apr boundary is executable and production remains evidence-gated |
| Classification trees | Lease/licence and date-versioned works/service | Works/service consequences now change at 14-Oct-2024; both tree families remain unverified and unlinked | **VERIFY** the current works/service era with its rule chain; review lease/licence after source update |

### 5.3 Karnataka

| Instrument / rule | Encoded path | Material dependencies and gaps | Review disposition |
|---|---|---|---|
| Conveyance — `KA-ART20-conveyance` | Base rate/first-sale bands plus infrastructure cess and local surcharge | Missing Rs 35-45 lakh first-sale band; local surcharge lacks primary evidence; source spine is stale | **REFUSE** totals until both the current band and surcharge law are encoded |
| Bare conveyance rate — `KA-ART20-rate` | 5% cross-reference target | Must be audited through all annual amendment Acts | **REFUSE** from 1-Jan-2021 until the Act/commencement sweep is complete; historical arithmetic remains testable |
| Gift — `KA-ART28-gift` | Fixed family amounts or conveyance rate; non-family cess | Family-gift cess treatment unresolved; local surcharge/instrument scope not modelled | **REFUSE** total until cess and surcharge scope are settled |
| Lease / leave and licence — `KA-ART30-lease` | Term bands; >30 years routes to conveyance | Family-lease proviso missing; perpetuity/long-term cess missing; current Act audit incomplete | **REFUSE** from 1-Jan-2021 until the source graph and missing classification/cess inputs are complete |
| POA — `KA-ART41-poa` | Fixed common clauses | Known stale after Act 04/2024; conveyance/development forks also require questions | **REFUSE** and re-encode |
| Mortgage with possession — `KA-ART34a-mortgage-with-possession` | Conveyance rate on secured amount | Current rule is flagged stale; municipal surcharge scope separately unresolved | **REFUSE** and re-encode |
| Mortgage without possession — `KA-ART34b-mortgage-without-possession` | Ad valorem | Current rule is flagged stale | **REFUSE** and re-encode |
| Hypothecation/loan — `KA-ART34d-hypothecation` | Banded rate and historical cap | Known stale: Act 04/2024 changed formula and removed the encoded cap; demand/term distinction incomplete | **REFUSE** and re-encode |
| Affidavit — `KA-ART4-affidavit` | Fixed amount | Known stale after Act 04/2024 | **REFUSE** and re-encode |
| Guarantee/security bond — `KA-ART47-security-bond` | Small-amount percentage/fixed switch | Known stale after Act 04/2024 | **REFUSE** and re-encode |
| Indemnity — `KA-ART29-indemnity-bond` | Cross-reference to security bond | Target Article 47 is stale; the transitive dependency gate now propagates its refusal through this otherwise unflagged wrapper | **REFUSE** until Article 47 is re-encoded |
| Works contract — `KA-ART5j-works-contract` | Residual agreement amount | Known stale after Act 04/2024; specific construction/JDA entries can displace it | **REFUSE** and re-encode with classification scope |
| Service agreement — `KA-ART5j-service-agreement` | Residual agreement amount | Known stale after Act 04/2024 | **REFUSE** and re-encode |
| Partnership — `KA-ART40-partnership` | Fixed/rate branches | Known stale after Act 04/2024 | **REFUSE** and re-encode |
| LLP — `KA-ART40A-llp` | Capital formula with cap | Known stale after Act 04/2024 | **REFUSE** and re-encode |
| Physical share transfer — `KA-share-transfer` | Historical and current Union rates | Current rule is flagged due state Art 52 amendment even though the amount is intended to follow the Union regime; scope must be legally resolved | **REFUSE** until founder confirms whether the state amendment touches this instrument and the flag is correctly scoped |
| Deficit/penalty — `KA-penalty` | Discretionary range | s.34 admission consequence may be mandatory 10x while Collector adjudication is discretionary; one range does not communicate both paths adequately | **REFUSE** until output semantics represent both statutory routes |
| Sections 4-6 — `KA-charging` | State-specific nominal duty and scope | Current source is a stale consolidation; later amendments must be checked even if they did not obviously target these sections | **REFUSE** every section from 1-Jan-2021 until the annual Act/commencement sweep is complete |
| Lease/licence classification tree | Both paths point to Article 30 | Legal test is plausible but unverified; rate target must be current | **VERIFY** only with the refreshed Article 30 source |

---

## 6. Cross-cutting release blockers

### P0-A — Enforce verification, not just display it

- Production computation must reject `verified_on: null`.
- Verification must be calculated across the complete dependency graph, not only the top-level rule.
- `verified_as_of` must represent the oldest/failing dependency and source freshness, not merely `rule.version.verified_on`.

### P0-B — Make pending verification transitive

The current computation checks the top-level rule and applied modifiers, but not cross-reference targets. Confirmed example:

`KA-ART29-indemnity-bond` -> `KA-ART47-security-bond`

The target is known stale from 3-Feb-2024. The evaluator now returns the dependency set
it traversed, and pending/verification gates evaluate every member, so the indemnity
wrapper refuses instead of returning the superseded target amount.

The same dependency mechanism should include:

- nested cross-reference targets;
- applied modifiers;
- penalty regimes;
- charging rules;
- classification trees used to select the terminal rule;
- later registration-fee rules when added.

### P0-C — Replace prose-only doubt with machine-readable gates

**Implemented for the deterministic inventory on 2026-07-21.** The corpus scan finds
50 uncertainty-language fields outside machine-readable pending data. Every field is
dispositioned by stable object/version/field key as a machine refusal/warning, an
explicit non-amount exclusion, or an unresolved legal-review item protected by a named
refusal. CI compares the exact key set and verifies that every declared control exists
with the stated severity.

This pass also closed two previously callable Karnataka gaps: the secondary-only local
surcharge refuses whenever applied, and gift totals refuse until infrastructure-cess
and local-surcharge scope are established. Delhi joint totals before the hike and at or
below Rs 25 lakh retain the verified 5% total with provisional-component warnings; the
post-hike joint cell above the threshold remains a refusal.

The closure audit now separately inventories all **80 executable pending controls**.
CI compares their exact stable IDs, requires a focused test/golden or explicit
fail-closed dependency disposition, and checks each declared warning/refusal severity
against the parsed corpus. This prevents a machine-readable flag from being added or
renumbered without a reviewable coverage update, even when no prose keyword changes.

### P0-D — Link rules to evidence

Extend source metadata so a rule dependency records at minimum:

- evidence `sha256`;
- Watchdog `source_id`;
- sweep/run ID and observed publication date;
- page/table/paragraph locator;
- consolidation/audited-through date where relevant;
- amendment and commencement chain;
- reviewer and review date.

Quoted text remains useful for review, but is not a substitute for the immutable source.

### P0-E — Derive freshness from Watchdog state

- `audited_through` must come from successful, complete sweeps of every required source family.
- A failed, partial, stale, or missing sweep must close affected answer paths automatically.
- A legitimate zero-publication period must be representable as a successful zero-row sweep after page-shape validation.
- Source `accepted` status must be generated from machine-checkable promotion criteria rather than hardcoded.

### P0-F — Preserve evidence durably

Before calling a source accepted:

- store blobs in versioned object storage in addition to the local cache;
- retain checksum manifests and perform periodic restore verification;
- preserve row occurrences/provenance separately from deduplicated blobs;
- add request timeouts, response-size limits, redirect allowlist checks, resumable checkpoints, and secret-safe fixture recording.

### P0-G — Add present-day and negative tests

Every supported path needs:

- an execution-date case at or near today;
- amendment-day and day-before boundaries;
- missing mandatory fact cases;
- exemption and special-clause negatives;
- a known official-calculator canary where one exists;
- a refusal test for every unsupported neighbouring cell.

---

## 7. Ordered execution backlog

1. **Implemented — safety gate:** production refusal for unverified dependencies; transitive cross-reference pending checks; machine-readable pending support for charging, penalty, and classification dependencies.
2. **Implemented — evidence contract and gate:** immutable document/acquisition references, source-complete amendment and commencement intervals, explicit freshness enforcement, committed-catalog validation, and a deterministic 0/115 coverage baseline. Three exact Maharashtra proposals are packaged pending human review; other acquisition and citation-link work remains outstanding.
3. **Watchdog hardening:** successful zero rows, timeouts, resumability, occurrence history, promotion reports, and durable blob storage.
4. **Finish the three MVP source graphs:**
   - Delhi Schedule I-A + Revenue history + MCD transfer duty + central securities.
   - Maharashtra Part 8 second full run + Part 8/IV-B back to 2015 + municipal surcharge sources.
   - Karnataka DPAL 2021-2026 + commencement notifications + IGR + municipal surcharge sources.
5. **Re-encode known-current failures:** Maharashtra Articles 4, 5(h)(B), 40(b), 47, 54, 63, the section 39 penalty fork, and the related works/service tree are date-versioned from Acts III of 2021, VII of 2022, XXXII of 2024, and IX of 2025. Karnataka Act 26/2021 and Act 04/2024 changes remain, followed by later Acts/commencements.
6. **Founder review:** one dependency-bounded, instrument-sized PR at a time, with evidence hashes and present-day goldens.
7. **Independent validation:** spot-check high-value/property, mortgage, lease, and works-contract paths; reconcile fixed canaries.
8. **Closed beta:** measure answer coverage and conditional correctness using representative matters. Do not count refusals as wrong answers; track them as coverage gaps.
9. **Only then expand:** historical depth, registration fees, inter-state calculations, additional states, and Tier 2 extraction.

---

## 8. Implemented safety units

**Implemented:** 2026-07-18. The engine now tracks transitive rule dependencies,
propagates pending flags through cross-references and penalty regimes, exposes
verified-only mode, enables it on production web compute/memo/classification
paths, and regression-tests the Karnataka indemnity defect. Charging sections,
penalty regimes, and classification trees now carry enforceable pending flags;
known Delhi s.4, Delhi/Karnataka penalty, and current Maharashtra works/service
uncertainties refuse; unresolved Delhi classification terminals are branch-scoped
refusals.

The first code change should be **P0-A + P0-B** as one safety unit:

1. Make `compute()` collect every rule traversed through cross-references and every modifier actually applied.
2. Run pending-verification checks over that complete dependency set.
3. Add a production option that refuses any dependency whose version is unverified.
4. Add a regression proving that current Karnataka indemnity refuses because its Article 47 target is stale.

This produces an immediate safety improvement without making any legal conclusion or changing a rate.

**Evidence unit implemented:** 2026-07-19. Every citation may now carry immutable
Watchdog document, acquisition, locator, chain, audit, and reviewer metadata.
Production computation, charging, memo, filing, and classification paths require
evidence current through an explicit application-supplied date. CI cross-checks any
supplied link against committed document/sweep/event records and accepted source IDs;
`EVIDENCE-COVERAGE.md` is a deterministic ship artifact. Current coverage is 0/115,
because the available accepted archive does not contain the primary documents cited
by most numeric rules. Three exact Maharashtra dependencies now have mechanically
validated proposal packets, but remain unlinked until human review. The next work is
source acquisition and truthful per-citation linking, not weakening the gate.

**Release-candidate unit implemented:** 2026-07-21. The engine can now emit the
exact input-dependent rule, cross-reference, applied-modifier, and penalty graph.
The candidate assessor carries immutable evidence hashes and chain intervals, requires
regression/refusal-neighbour receipts and an explained canary disposition for review
readiness, and treats founder verification as a separate production-readiness gate.
Because current coverage is 0/115, this machinery correctly produces blockers rather
than a false release candidate.
