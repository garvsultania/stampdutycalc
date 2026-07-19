# StampDraft MVP Source and Coverage Matrix

**Updated:** 2026-07-19
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

As of this document, every `verified_on` value is null and the generated evidence report records **0/99 Watchdog-linked citation dependencies**. Production web computation, memo, filing, and classification paths enforce both founder verification and current immutable evidence, so **every current rule remains blocked from production by design**. Draft engine and golden tooling deliberately permit unmerged versions for testing. The statuses below describe readiness for founder review; they do not authorize production use.

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
| Delhi | 22 | 59 | 0 | 2024-06-01 | Rates drafted; notification history and municipal evidence incomplete |
| Maharashtra | 23 | 67 | 0 | 2024-06-01 | Several known-current errors refuse; Part 8 has one complete run and Part IV-B has three complete five-year audits, but generated promotion and pre-2021 history remain incomplete |
| Karnataka | 17 | 40 | 0 | 2024-06-01 | Consolidated source is stale; many current paths refuse |

The 166/166 golden result proves deterministic agreement with the drafted expectations. It does not independently prove the law.

---

## 4. Source-family coverage

### 4.1 Delhi

| Source family | Needed for | Evidence now | Watchdog state | Gap and required proof | Priority |
|---|---|---|---|---|---|
| Current Delhi Schedule I-A and amendment chain | All Delhi Schedule rates, cross-references, exemptions, historical eras | Official Delhi-hosted central Schedule I plus a secondary Schedule I-A reproduction; the reproduction has a known column-slip defect | No complete source | Obtain a current first-party Schedule I-A or assemble it from Delhi Gazette amendment instruments; archive every instrument and link each encoded article | **P0** |
| Delhi Revenue notification history | Remissions, exemptions, procedural and rate notifications | Current page probe found 10 PDFs across 2 listing URLs | Provisional probe only | Traverse all history and pagination; acquire documents; record OCR status for scans; repeat with zero additions | **P0** |
| DMC/MCD transfer-duty law and 10-Jul-2023 notification | Sale, gift, mortgage with possession, contract for transfer, perpetual lease | Citations and founder rulings exist, but the primary notification is not in the immutable evidence archive | No registered source family | Add the municipal source; acquire s.147 text and the complete notification; prove instrument scope, bases, threshold, gender/joint treatment, and effective date | **P0** |
| DORIS/property-registration output | Joint rates, mortgage base, registrar-practice reconciliation | Manual references only | No canary | Create fixed, recorded reconciliation scenarios; a portal result is a canary, not the legal source | **P0** |
| Central e-Gazette/MoF/DEA securities material | Physical share transfer from 2020 and historical central rate | Citations exist; no complete Watchdog-backed chain | No source family | Archive Finance Act 2019 provisions, commencement notifications, rate notifications, and relevant official FAQs | **P1** |
| Judgments and classification authorities | Conveyance cross-reference, lease/licence, works/service, transfer-duty scope | Citations in rule text; no immutable judgment corpus | Manual only | Keep a curated, licensed or public first-party judgment set with pinpoint references; monitor later overruling separately from the Gazette Watchdog | **P1** |
| Registration fee table | Property registration adjunct | Researched, not encoded | None | Resolve whether the Rs 50,000 cap survives and obtain current official fee evidence | **DEFER** |

### 4.2 Maharashtra

| Source family | Needed for | Evidence now | Watchdog state | Gap and required proof | Priority |
|---|---|---|---|---|---|
| Maharashtra Act / Schedule spine | All Schedule articles and Act-level sections | Local IGR Schedule PDF expressly current only through 1-Jun-2022; some India Code references | Not an accepted current spine | Link a current consolidated spine to all amendments; retain consolidation date as evidence metadata | **P0** |
| e-Gazette Part 8 English Extra-Ordinary | Amendment Acts and ordinances | 195 unique PDFs for 2025-04-09 to 2026-07-16; hashes verified | One successful complete run; second recorded run was bounded/partial | Run a second complete identical acquisition with zero additions; extend discovery/acquisition back to the 2015 product floor | **P0** |
| e-Gazette Part IV-B | Stamp notifications, commencements, concessions, surcharge and remission orders | 2,575 rows / 2,547 unique immutable PDFs archived for 2021-07-17 to 2026-07-19; independent full re-fetch added zero blobs; stable-identity sweep reused 2,575/2,575 with zero additions | Accepted for the stated five-year interval | Extract and classify stamp instruments; extend acquisition back to the 2015 product floor before claiming older-chain completeness | **P0** |
| Municipal/transport surcharge law | Metro cess, s.149A/s.149B stacking, city coverage, LBT | Partial statutory quotations and secondary corroboration | No complete source family | Archive the municipal Acts, commencement/project notifications, city declarations, abeyance/revival instruments, and LBT instruments; model city and instrument scope explicitly | **P0** |
| IGR circulars, fee table, payment guidance | Registration fee, practice, stamping mode | Local pages/PDF references only | No complete source family | Add a dedicated first-party source; do not treat current IGR pages as proof of currency without dated sweeps | **P1** |
| Official calculator/canary | Property-rate reconciliation | Not automated | None | Add fixed scenario reconciliation only after the underlying rules are verified | **P1** |
| Registration fee table | Property registration adjunct | Researched, not encoded | None | Archive and verify the stepped fee table and family-gift exception | **DEFER** |

### 4.3 Karnataka

| Source family | Needed for | Evidence now | Watchdog state | Gap and required proof | Priority |
|---|---|---|---|---|---|
| DPAL base/consolidated Act | Schedule, s.3B, penalties, charging rules | Local official PDF whose newest amendment footnote is Act 55 of 2020 | Known stale | Preserve as historical evidence only; never use its silence to reject later amendments | **P0** |
| DPAL annual Acts and ordinances | Acts 26/2021, 11/2022, 12/2022, 31/2022, 03/2023, 04/2024, 23/2024, 30/2025, 42/2025 | 2025 probe found 77 identifiable Acts and 125 PDFs | Provisional probe only | Prove annual pages for 2021-2026, acquire all PDFs, assert the known-Act checklist, and repeat with zero additions | **P0** |
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
| Conveyance — `DL-ART23-conveyance` | Schedule duty by transferee category plus municipal transfer duty and 2023 threshold | Primary MCD notification not archived; joint stamp split and joint post-hike treatment unresolved | **RESTRICT** to separately sourced male/female cells; **REFUSE** joint > Rs 25 lakh and all unsourced categories |
| Gift — `DL-ART33-gift` | Conveyance charge on value plus gift transfer duty | Must prove that the 2023 hike applies to gifts; joint donee and any family concession require evidence | **REFUSE** until notification scope is established; then review non-joint cells |
| Agreement to sell with possession — `DL-ART23A-ats-part-performance` | 90% of conveyance duty plus transfer duty | Transfer-duty scope, 90% base, threshold test, and set-off memo treatment need primary proof | **REFUSE** pending MCD evidence and questionnaire proof |
| Agreement to sell without possession — `DL-ART5c-agreement-to-sell` | Fixed Article 5(c) amount | Registrar practice may treat some variants ad valorem; possession fork is high consequence | **REFUSE** until the supported no-possession fact pattern is defined and verified |
| Lease — `DL-ART35-lease` | Term-banded Bond/Conveyance cross-references | OCR ambiguity in the >30-year band; >100 years/perpetuity incomplete; premium and category treatment need review | **RESTRICT** to verified term bands after a clean primary Schedule; refuse the ambiguous tail |
| Leave and licence — `DL-leave-and-license` | Treated as Article 35 agreement to let | Delhi registrar-practice treatment not positively established for all licences | **REFUSE** until practice and classification boundary are verified |
| Mortgage with possession — `DL-ART40a-mortgage-with-possession` | Conveyance duty on secured amount plus transfer duty | Municipal base, scope, gender treatment, and 2023 hike application are assumptions | **REFUSE** |
| Mortgage without possession — `DL-ART40b-mortgage-without-possession` | Ad valorem with cap | Collateral/auxiliary-security branch not encoded; current Schedule must be proved | **RESTRICT** to a verified principal mortgage without collateral-security exception |
| Loan/hypothecation — `DL-ART6-loan-hypothecation` | Tenor-selected rate and cap | Bill-of-exchange accompanying exemption and instrument classification require questions | **RESTRICT** to ordinary standalone agreements after primary verification |
| Indemnity — `DL-ART34-indemnity-bond` | Cross-reference to security bond | Depends on Bond/Security Bond cross-reference chain and correct classification | **VERIFY** after the complete primary chain is linked |
| Guarantee/security bond — `DL-ART57-security-bond` | Small-amount switch to Bond; otherwise fixed | Source is a reproduction and must be replaced or corroborated by a clean primary Schedule | **VERIFY** after primary evidence |
| Partnership — `DL-ART46-partnership` | 1% of capital capped at Rs 5,000 | Known duty-column slip; exact clause (a) amount for capital <= Rs 500 unresolved | **RESTRICT** to capital > Rs 500 after clean primary proof; refuse the lower cell |
| Partnership dissolution — `DL-ART46B-partnership-dissolution` | Fixed amount | Same column-slip source family | **VERIFY** after clean primary proof |
| LLP — `DL-llp-agreement` | Treated as partnership | Classification is practice-based, not tied to an explicit verified Delhi entry | **REFUSE** |
| General POA — `DL-ART48-gpa` | Fixed common case | POA-for-sale, consideration, number-of-attorneys, and other clauses can change duty materially | **RESTRICT** only after a clause-selection questionnaire is mandatory |
| Special POA — `DL-ART48-spa` | Fixed single-transaction case | Registration-only clause may carry a different amount | **RESTRICT** only after purpose is explicitly selected |
| Affidavit — `DL-ART4-affidavit` | Fixed amount | Court, enrolment, and pension exemptions not modelled; current Schedule source incomplete | **RESTRICT** to a verified non-exempt affidavit |
| Works contract — `DL-works-contract` | Residual agreement amount | Encoded partly from absence of a specific entry; complete notification history is needed to prove the negative | **REFUSE** until current-source completeness is established |
| Service agreement — `DL-service-agreement` | Article 5 residual/service path | Specific agreement sub-clauses can displace the residual | **RESTRICT** after the questionnaire rules out specific higher entries |
| Physical share transfer — `DL-ART62-share-transfer` | Historical 0.25%; current Union 0.015% | Central evidence chain must be archived; payer is contested but does not change amount | **VERIFY** amount after central-source acquisition; payer remains a non-amount caveat |
| Deficit/penalty — `DL-penalty` | Discretionary range | Delhi-specific amendments and practical/statutory minimum not verified | **REFUSE** |
| Several instruments / distinct matters / multiple descriptions — `DL-charging` | Sections 4-6 | Delhi s.4 nominal duty may have been amended; currently prose-only pending | **REFUSE** s.4; review s.5/s.6 only after current Act proof |

### 5.2 Maharashtra

| Instrument / rule | Encoded path | Material dependencies and gaps | Review disposition |
|---|---|---|---|
| Conveyance — `MH-ART25-conveyance` | Area-based Schedule rate, women concession, metro modifier | Metro city list and 1%/2% stacking unresolved; LBT incomplete; women-order scope/currency incomplete | **RESTRICT** to positively proven non-metro/non-LBT cases without concession; **REFUSE** metro and concession cells until sourced |
| Gift — `MH-ART34-gift` | Fixed close-family, 3% family, or conveyance rate | Metro/LBT treatment is absent; relation/property-use precedence must be confirmed | **RESTRICT** to verified family definitions and locations proven free of omitted surcharges |
| Lease — `MH-ART36-lease` | Conveyance rate on term percentage of market value | User-supplied market-value concept must include required premium/deposit treatment; LBT and area effects need proof | **RESTRICT** after current Schedule and locality questions are verified |
| Leave and licence — `MH-ART36A-leave-license` | 0.25% formula up to 60 months, then lease | Deposit classification and >60-month cross-reference require verified inputs | **VERIFY** the <=60-month standard path after current-source review; restrict the tail |
| Memorandum of association — `MH-ART39-moa` | Share-capital rate with minimum/cap and AoA branch | Current Act sweep and exact accompanied-by-AoA facts | **VERIFY** after current-source review |
| POA — `MH-ART48-poa` | Fixed common clauses | Consideration/sale/developer clauses route to conveyance and are not represented by the flat path | **RESTRICT** to verified clauses through a mandatory questionnaire |
| Mortgage with possession — `MH-ART40a-mortgage-with-possession` | Conveyance rate on amount secured | Metro surcharge reaches only specified mortgage types; current modifier is not attached; subtype matters | **REFUSE** metro/possibly usufructuary cases; review only a sourced non-surcharge subtype |
| Mortgage without possession — `MH-ART40b-mortgage-without-possession` | Rate with minimum and cap | Consortium/bank cap and alternate line ambiguities remain | **RESTRICT** to verified non-consortium standard cases |
| Indemnity — `MH-ART35-indemnity-bond` | Fixed amount with historical era | Requires current Act sweep but no known current error recorded | **VERIFY** after current-source review |
| Guarantee/security bond — `MH-ART54-security-bond` | Currently encodes superseded text | Known wrong version: operative 2022 substitution was confused with historical footnote | **REFUSE** and re-encode new eras |
| Partnership — `MH-ART47-partnership` | Rate with cap | Known stale: 2024-effective amendment raised the cap | **REFUSE** and re-encode |
| LLP — `MH-ART47-llp` | Partnership-linked rate | Shares the stale cap | **REFUSE** and re-encode |
| Affidavit — `MH-ART4-affidavit` | Fixed amount | Known stale: 2024-effective amendment changed the amount | **REFUSE** and re-encode |
| Works contract — `MH-ART63-works-contract` | Thresholded marginal formula with cap | Known stale: threshold and rate changed from 14-Oct-2024 | **REFUSE** and re-encode |
| Service agreement — `MH-ART5hB-service-agreement` | Residual fixed amount | Many specific Article 5 sub-clauses can displace it; current works/service tree quotes stale works law | **REFUSE** until classification tree and current competing entries are verified |
| Physical share transfer — `MH-share-transfer` | Historical state/central rate and current Union rate | Central evidence chain and payer treatment | **VERIFY** amount after central-source acquisition |
| Deficit/penalty — `MH-penalty` | Per-month formula with cap | Current full-Act section and adjudication distinctions must be tied to evidence | **VERIFY** only after current Act review and memo semantics are approved |
| Sections 4-6 — `MH-charging` | State-specific nominal duty and transaction scope | Current text appears sourced, but exact historical amendment dates are approximated at the 2015 floor | **VERIFY** current use; **REFUSE** historical claims until exact era dates are proved |
| Classification trees | Lease/licence and works/service | Works tree embeds pre-amendment amounts; both trees remain unverified | **REFUSE** current works/service routing; review lease/licence after source update |

### 5.3 Karnataka

| Instrument / rule | Encoded path | Material dependencies and gaps | Review disposition |
|---|---|---|---|
| Conveyance — `KA-ART20-conveyance` | Base rate/first-sale bands plus infrastructure cess and local surcharge | Missing Rs 35-45 lakh first-sale band; local surcharge lacks primary evidence; source spine is stale | **REFUSE** totals until both the current band and surcharge law are encoded |
| Bare conveyance rate — `KA-ART20-rate` | 5% cross-reference target | Must be audited through all annual amendment Acts | **VERIFY** only as an internal dependency after the Act sweep |
| Gift — `KA-ART28-gift` | Fixed family amounts or conveyance rate; non-family cess | Family-gift cess treatment unresolved; local surcharge/instrument scope not modelled | **REFUSE** total until cess and surcharge scope are settled |
| Lease / leave and licence — `KA-ART30-lease` | Term bands; >30 years routes to conveyance | Family-lease proviso missing; perpetuity/long-term cess missing; current Act audit incomplete | **RESTRICT** ordinary non-family leases <=30 years after current Act review; refuse other branches |
| POA — `KA-ART41-poa` | Fixed common clauses | Known stale after Act 04/2024; conveyance/development forks also require questions | **REFUSE** and re-encode |
| Mortgage with possession — `KA-ART34a-mortgage-with-possession` | Conveyance rate on secured amount | Current rule is flagged stale; municipal surcharge scope separately unresolved | **REFUSE** and re-encode |
| Mortgage without possession — `KA-ART34b-mortgage-without-possession` | Ad valorem | Current rule is flagged stale | **REFUSE** and re-encode |
| Hypothecation/loan — `KA-ART34d-hypothecation` | Banded rate and historical cap | Known stale: Act 04/2024 changed formula and removed the encoded cap; demand/term distinction incomplete | **REFUSE** and re-encode |
| Affidavit — `KA-ART4-affidavit` | Fixed amount | Known stale after Act 04/2024 | **REFUSE** and re-encode |
| Guarantee/security bond — `KA-ART47-security-bond` | Small-amount percentage/fixed switch | Known stale after Act 04/2024 | **REFUSE** and re-encode |
| Indemnity — `KA-ART29-indemnity-bond` | Cross-reference to security bond | **Critical transitive-refusal bug:** target Art 47 is stale, but the top-level indemnity rule has no flag and can still emit the old amount | **REFUSE**; fix transitive dependency checks before any review |
| Works contract — `KA-ART5j-works-contract` | Residual agreement amount | Known stale after Act 04/2024; specific construction/JDA entries can displace it | **REFUSE** and re-encode with classification scope |
| Service agreement — `KA-ART5j-service-agreement` | Residual agreement amount | Known stale after Act 04/2024 | **REFUSE** and re-encode |
| Partnership — `KA-ART40-partnership` | Fixed/rate branches | Known stale after Act 04/2024 | **REFUSE** and re-encode |
| LLP — `KA-ART40A-llp` | Capital formula with cap | Known stale after Act 04/2024 | **REFUSE** and re-encode |
| Physical share transfer — `KA-share-transfer` | Historical and current Union rates | Current rule is flagged due state Art 52 amendment even though the amount is intended to follow the Union regime; scope must be legally resolved | **REFUSE** until founder confirms whether the state amendment touches this instrument and the flag is correctly scoped |
| Deficit/penalty — `KA-penalty` | Discretionary range | s.34 admission consequence may be mandatory 10x while Collector adjudication is discretionary; one range does not communicate both paths adequately | **REFUSE** until output semantics represent both statutory routes |
| Sections 4-6 — `KA-charging` | State-specific nominal duty and scope | Current source is a stale consolidation; later amendments must be checked even if they did not obviously target these sections | **VERIFY** only after the annual Act sweep |
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

The target is known stale from 3-Feb-2024, while the indemnity path can still return the superseded amount. The evaluator must return the dependency set it traversed, and the pending/verification gate must evaluate every member.

The same dependency mechanism should include:

- nested cross-reference targets;
- applied modifiers;
- penalty regimes;
- charging rules;
- classification trees used to select the terminal rule;
- later registration-fee rules when added.

### P0-C — Replace prose-only doubt with machine-readable gates

Material doubts currently live only in `notes_for_reviewer` for several Delhi transfer-duty cells, charging rules, penalties, classification boundaries, Maharashtra surcharges, and Karnataka cess/surcharge branches. Every amount-affecting doubt needs a scoped machine-readable refusal.

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
2. **Implemented — evidence contract and gate:** immutable document/acquisition references, source-complete amendment and commencement intervals, explicit freshness enforcement, committed-catalog validation, and a deterministic 0/99 coverage baseline. Actual source acquisition and citation linking remain outstanding.
3. **Watchdog hardening:** successful zero rows, timeouts, resumability, occurrence history, promotion reports, and durable blob storage.
4. **Finish the three MVP source graphs:**
   - Delhi Schedule I-A + Revenue history + MCD transfer duty + central securities.
   - Maharashtra Part 8 second full run + Part 8/IV-B back to 2015 + municipal surcharge sources.
   - Karnataka DPAL 2021-2026 + commencement notifications + IGR + municipal surcharge sources.
5. **Re-encode known-current failures:** Maharashtra Art 4, 47, 54, 63 and related trees; Karnataka Act 26/2021 and Act 04/2024 changes, followed by later Acts/commencements.
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
`EVIDENCE-COVERAGE.md` is a deterministic ship artifact. Current coverage is 0/99,
because the available accepted archive does not contain the primary documents cited
by the numeric rules. The next work is source acquisition and truthful per-citation
linking, not weakening the gate.
