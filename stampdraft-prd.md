# StampDraft — Product Requirements Document (v1.1)

**Product:** StampDraft — India's stamp duty computation engine
**Owner:** Garv Sultania
**Status:** Approved for build — execute Phases 0–2 (Phase 3 parked pending beta feedback)
**Executor:** Claude (Fable 5 preferred for encoding milestones) via Claude Code, per `stampdraft-handoff-prompt.md`
**Date:** July 2026 · v1.1 changelog at end of document

---

## 1. Problem Statement

Stamp duty in India is levied on *instruments* (not just property) under the Indian Stamp Act, 1899 and state-specific Acts/amendments. There is no consolidated, current, computable source of stamp duty law anywhere — not with governments, not with legal publishers. The "current law" of any state is a derivation: base Act + state amendment Acts + gazette notifications + reduction/remission orders. Practitioners assemble this mentally or from stale bare-act PDFs.

Consequences: under-stamped documents are inadmissible in evidence, attract deficit duty plus penalties (up to 10x in several states), and derail transactions and disputes years after execution. Existing "calculators" are property-only, lead-gen toys with no provenance, no instrument coverage, and no versioning.

**StampDraft's thesis:** the consolidated, versioned, citation-backed, computable table of stamp duty law *is the product*. Computation is a thin deterministic layer on top of it. LLMs are used at **build time** (encoding law, monitoring gazettes) and as an **escalation path** (ambiguous classification), never as the runtime calculator.

---

## 2. Users & Jobs-to-be-Done

Primary (paying) users — recurring professional buyers only:

1. **Transactional lawyers & law firms** — "Before execution, tell me the correct instrument classification, duty, and where/how to stamp, with citations I can put on file."
2. **Company Secretaries / CAs** — "Compute duty on LLP deeds, share transfers, POAs, indemnities across states; give me a defensible memo."
3. **In-house legal / NBFCs / banks** — "Volume-check our standard documents (loan agreements, mortgages, guarantees) per state; API access."
4. **Litigators** — "This 2019 document is being impounded. What was the correct duty *as on execution date*, what's the deficit, what's the penalty?"

Secondary (non-paying, top-of-funnel): individual property buyers using the free property calculator.

**Anti-persona:** one-time consumers as a revenue base. They churn; they are marketing, not market.

---

## 3. Scope

### MVP (Phase 0–1)

- **Jurisdictions (3):** Delhi (Indian Stamp Act + Delhi amendments), Maharashtra (Maharashtra Stamp Act, 1958 — its own statute), Karnataka (Karnataka Stamp Act, 1957). Rationale: high commercial volume, English-language notifications and portals, official reference calculators exist for reconciliation. *UP deliberately excluded from MVP: Hindi-language gazette/portal raises ingestion risk; add in Phase 3.*
- **Instruments (~15 by commercial frequency):** conveyance/sale deed; agreement to sell; lease; leave & license; gift deed; general POA; special POA; mortgage deed (with/without possession); loan/hypothecation agreement; indemnity bond; guarantee/surety bond; partnership deed; LLP agreement; affidavit; works contract / service agreement (classification-sensitive pair); share purchase/transfer (physical).
- **Modes:** (a) prospective computation (as of today), (b) historical computation (as-of any date ≥ 2015), (c) deficit + penalty computation.
- **Tiers:** Tier 1 (questionnaire → rules engine) and Tier 2 (document upload → field extraction → confirmed computation). Tier 3 (full ambiguity analysis) is designed but ships Phase 2.

### Explicit Non-Goals (MVP)

- **Circle rate / ready reckoner database.** The user inputs consideration and (where relevant) market/reckoner value. Building the hyperlocal valuation DB is a separate, much larger product (Phase 4+). MVP links out to official state rate portals.
- E-stamp procurement/execution (Leegality's territory; future integration, not build).
- Judicial stamps / court fees (Phase 3+ — same engine, second schedule).
- Registration fee computation ships as a *basic* adjunct for property instruments only (flat % + caps), clearly labeled.
- **Stamp duty refunds** (spoiled/unused stamps, cancelled transactions) and **exchange deeds** — real workflows, deliberately deferred; the schema accommodates both when added.
- Legal opinions signed by StampDraft. See §12 (Advocates Act positioning).

---

## 4. Product Flows (lawyer's-eye view)

### Flow A — Quick Compute (Tier 1)
1. Select state → select instrument *or* answer classification questionnaire (below).
2. Enter inputs (consideration, market value if higher, term/rent for leases, relationship for gifts, gender where concessional, area type for cess).
3. Output: **duty breakup** (base duty + surcharge + cess + basic registration fee where applicable), **rounding applied per state rule**, **citations** (Act, Article/Entry, amending notification no. & date), **verified-as-of stamp**, and payment-mode guidance (e-stamp/franking/SHCIL availability per state).
4. One-click **PDF memo export** — formatted for the matter file: inputs, output, citations, timestamp, rules-version hash. This is the artifact lawyers actually need; the number alone is not the product.

### Flow B — Classification Questionnaire
For classification-sensitive instruments, a decision tree of 8–15 questions encoding the legal tests (possession transferred? term certain or perpetuity? consideration present? exclusive rights? relationship between parties? refundable deposit vs premium?). Each answer maps to statutory/judicial tests; the terminal node yields the Schedule entry. If answers are contradictory or land in a known grey zone (e.g., license with exclusive possession indicia), the flow **escalates** with an explanation instead of guessing.

### Flow C — Document Check (Tier 2)
1. Upload draft (PDF/DOCX, cap 60 pages for cost control).
2. Extraction model pulls only the ~12 fields the rules engine needs (parties + relationship, consideration, term, possession clause, execution place, property location, instrument self-description).
3. **Fields are presented for confirmation — never silently trusted.** The lawyer confirms/edits each extracted field (displayed with the source snippet from the document). Confirmed fields feed Flow A.
4. Output additionally flags: multi-state execution issues, multiple-instrument/single-transaction issues (§6.4), and mismatch between the document's self-description and its legal substance.

### Flow D — Historical / Adjudication Mode
As-of date picker → rules engine resolves the rule version effective on that date → duty then vs duty paid → **deficit + penalty** computed per that state's penalty regime (e.g., %/month with cap vs. discretionary up-to-10x — modeled per state, with the discretionary range shown as a range, never a false point estimate).

### Flow E — Firm Workspace
Saved matters, team seats, audit log of every computation (immutable: inputs, rules-version hash, output, user, timestamp). API keys for volume users.

---

## 5. The Legal Computation Model (core spec)

This is the heart of the product. The engine must model, natively:

### 5.1 Duty base types
- **Fixed** (e.g., ₹100 affidavit).
- **Ad valorem on consideration.**
- **Ad valorem on market value** (or higher-of consideration/market value — the standard conveyance rule).
- **Formula bases** — leases are the canonical case: duty on a multiple of average annual rent, with the multiple depending on term bands, plus premium/deposit components treated separately. The schema supports arbitrary arithmetic expressions over named inputs.
- **Slabs** (marginal and flat-slab variants both exist across states — model both).

### 5.2 Rate structures
Percentage, fixed, slab table, **minimum duty**, **maximum cap** (several Maharashtra articles cap duty — caps are load-bearing for high-value commercial work and a differentiator vs. naive calculators).

### 5.3 Cross-references
"Same duty as a Conveyance (No. 23)" / "same duty as a Bond (No. 15)" — first-class pointers in the schema, resolved at computation time against the *same version snapshot* (a cross-ref must never resolve across versions).

### 5.4 General charging rules (Act-level, jurisdiction-parameterized)
- **S.4** — several instruments, one transaction: principal instrument bears full duty; others nominal. UI: principal-instrument selector.
- **S.5** — instrument comprising distinct matters: aggregate duty.
- **S.6** — instrument within two+ descriptions: highest duty applies. This is also the escalation trigger for classification grey zones.
- **Execution date** determines applicable law (drives temporal versioning).
- **Execution place + subject-matter location:** inter-state differential duty (instrument executed in State A relating to property in State B → duty credit and differential payable in B). Modeled as a dedicated module; this is a daily real-world scenario and almost universally mishandled.
- **Instruments executed outside India:** chargeable on first receipt in India (flag + timeline note; computation per receiving state).

### 5.5 Modifiers
- **Concessions:** gender-based (with joint-ownership rules — e.g., primary-holder logic), family-relation concessions on gifts (state-specific relative definitions — encode each state's list, do not generalize), senior citizen, first-time buyer schemes, amnesty/remission schemes (time-bound notification-driven — natural fit for the versioned model).
- **Surcharges/cess:** metro cess, local body tax, infrastructure cess — applicability keyed to area classification (municipal corporation / municipality / panchayat), which is a user input in MVP with an area-lookup helper in Phase 3.
- **Rounding:** per-state rounding rules (round up to nearest ₹100/₹500 etc.) applied last, explicitly, and shown in the breakup.

### 5.6 Penalty model (per state)
Deficit duty + penalty regime: rate-per-month variants with caps, and discretionary "up to 10x" variants. Discretionary regimes output a **range with the statutory maximum**, plus the adjudication path (S.31/S.47A equivalents). Never fabricate precision the law doesn't have.

---

## 6. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│  KNOWLEDGE PIPELINE (build-time, LLM-assisted)           │
│  Gazette crawlers → notification classifier (small LLM)  │
│  → candidate rule-diff (frontier LLM) → LAWYER REVIEW    │
│  QUEUE → versioned rules DB (append-only)                │
└───────────────┬─────────────────────────────────────────┘
                │ verified, versioned rules-as-data
┌───────────────▼─────────────────────────────────────────┐
│  RULES ENGINE (runtime, deterministic, zero-LLM)         │
│  temporal resolver → classification tree → base calc →   │
│  modifiers → rounding → citation assembly                │
└───────────────┬─────────────────────────────────────────┘
                │
   ┌────────────┼──────────────────┐
   │            │                  │
 Tier 1       Tier 2             Tier 3 (Phase 2)
 questionnaire  doc-field         full ambiguity analysis
 (no LLM)       extraction        (frontier LLM + verified
                (small LLM,       corpus RAG + human-loop)
                confirm-not-trust)
```

### 6.1 Rules-as-data schema (illustrative)

```json
{
  "rule_id": "MH-ART36-lease",
  "jurisdiction": "MH",
  "act": "Maharashtra Stamp Act, 1958",
  "article": "36",
  "instrument": "lease",
  "version": {
    "effective_from": "2025-04-01",
    "effective_to": null,
    "source": {"type": "notification", "ref": "No. Mudrank-2025/…", "gazette_date": "2025-03-28", "url": "…"},
    "verified_by": "reviewer_id", "verified_on": "2026-07-01"
  },
  "base": {"type": "formula",
           "expr": "duty_base(term_years, avg_annual_rent, premium, refundable_deposit)",
           "bands": [{"term_lte": 5, "multiple": 0.25}, {"term_lte": 10, "multiple": 0.5}]},
  "rate": {"type": "ad_valorem", "pct": 5.0, "min_duty": 100, "cap": null},
  "cross_ref": null,
  "modifiers": ["MH-metro-cess", "MH-lbt"],
  "rounding": {"mode": "ceil", "nearest": 100},
  "notes_for_reviewer": "…"
}
```

Constraints: **append-only versioning** (never mutate; new version supersedes with effective_from); every rule carries a source citation or it cannot be activated; cross-refs resolve within a version snapshot; the entire active ruleset for a state hashes to a `rules_version` recorded on every computation.

### 6.2 Classification trees
Stored as data (question nodes → legal-test annotations → edges → terminal Schedule entries), versioned identically. Grey-zone terminal nodes are explicit `ESCALATE` states with reason text.

### 6.3 Knowledge pipeline (the moat)
1. **Crawlers:** daily crawl of each state's e-gazette, IGR/registration dept, and finance dept notification pages. Central e-gazette (egazette.gov.in) for Indian Stamp Act changes.
2. **Classifier:** cheap model labels each new document — touches stamp law? (state, instrument(s), nature: rate change / exemption / amnesty / procedural).
3. **Diff proposal:** frontier model drafts the structured rule change (new version JSON) with quoted source text.
4. **Human gate (PR-based — no review UI is built):** rule encodings and classification trees live as JSON/data files in the repo; the pipeline emits proposed rule changes as **draft GitHub pull requests** — one instrument (or notification) per PR, with quoted source statute/notification text in `notes_for_reviewer` so the diff is reviewable without leaving GitHub. The founder (qualified lawyer, sole verifier) merges = verification; `verified_by`/`verified_on` populate on merge. CI blocks merge if the state's golden suite fails or any active rule lacks a citation. **No rule version activates without a merged PR.** Target SLA: notification → live verified rule in ≤ 2 business days (founder-in-loop collapses the cycle); classifier pass within 24h.
5. **Freshness surfacing:** every state shows "verified against gazette as of {date}"; crawler failures > 7 days degrade the state's confidence banner automatically.
6. **Reconciliation canaries:** weekly cron runs a fixed scenario set through official state calculators (Maharashtra e-ASR calc, Delhi, Kaveri) via headless browser and diffs against engine output; any divergence auto-opens a review ticket.

### 6.4 Tier 2 extraction
Small/cheap model, structured-output extraction of the fixed field set, each field returned with a verbatim source snippet + page ref for the confirm UI. Page cap 60; scanned PDFs OCR'd first. Extraction accuracy is a *UX* problem not a *correctness* problem because of confirm-not-trust — correctness always flows from confirmed inputs + deterministic engine. The **extraction model version is logged in the audit record** alongside the rules-version hash, so edit-rate shifts can be correlated to model swaps.

### 6.5 Tier 3 (Phase 2 design)
Frontier model, RAG strictly over the verified corpus (Acts, notifications, encoded rules, and a curated set of leading judgments on classification), producing a structured **analysis memo**: candidate classifications, tests applied, S.6 highest-duty fallback computation, confidence, and an explicit recommendation to obtain adjudication (S.31) where genuinely uncertain. Human-review add-on: routed to an empanelled lawyer (marketplace-lite, Phase 3).

### 6.6 Stack (suggested, optimize for solo-founder + Claude Code velocity)
Postgres (rules, versions, audit) · TypeScript preferred throughout (shared types between engine and UI) · Next.js front-end · **rules engine as a pure, side-effect-free, standalone importable library with a CLI** (100% deterministic outputs; the CLI makes founder golden-suite verification scriptable rather than click-through) · Playwright for canary crons (canary failure opens an issue, never blocks the engine or deploys) · S3-compatible storage for uploads with lifecycle deletion · LLM calls via API with per-tier model routing.

---

## 7. Non-Functional Requirements

- **Auditability:** every computation persists {inputs, confirmed field **values**, rules_version hash, extraction model version (if Tier 2), output, citations, timestamp, user}. Reproducible byte-for-byte given confirmed values + hash. **Verbatim document snippets are not permanently retained in the audit** — they follow the uploaded document's retention lifecycle: document deleted ⇒ snippets deleted. Confirmed values persist because the lawyer affirmatively entered them.
- **Determinism:** rules engine is LLM-free and pure. Same inputs + same rules_version ⇒ same output, always.
- **Citations mandatory:** no numeric output without its legal source rendered alongside.
- **Security & DPDP Act:** uploaded documents contain personal data → explicit consent notice, encryption at rest, default 30-day retention (user-configurable to 0 — compute-and-delete, consistent with the snippet lifecycle above), no training on client documents, data residency in India.
- **Availability:** 99.5% target; the engine is trivially cacheable and stateless.
- **Latency:** Tier 1 < 300ms; Tier 2 extraction < 60s for 60 pages.

---

## 8. Cost Model (build + run, honest numbers)

### Build (per state)
- LLM parsing of Act + Schedule + notification back-catalogue: negligible (low thousands of ₹).
- **Lawyer verification — internalized.** DECIDED: the founder (qualified lawyer) is the sole verifier for all encodings, including the 2015+ historical back-catalogue. Cash cost ≈ ₹0; real cost is founder time, estimated 50–90 hours/state via PR review (the one-instrument-per-PR structure with inline source quotes is designed to make this fast). External spot-check sign-off remains optional pre-launch (₹30–60k if taken).
- Engineering: 10–14 weeks solo with Claude Code (see §15).

### Run (monthly, early stage)
- Infra (Postgres, app, storage, crons): ₹8–20k.
- Gazette monitoring: crawl + classify ~50–200 docs/day across 3 states with a small model: **₹3–10k**.
- Tier 2 inference: ~₹3–10 per document (extraction-only, small model, 60-page cap). At 1,000 docs/month: ₹3–10k.
- Tier 3 inference: ₹50–200 per analysis (frontier, multi-pass) — priced to user at ₹500–2,000, healthy margin.
- Ongoing legal review retainer: ₹25–50k/month covers notification sign-offs for 3 states at observed notification frequency (a handful of substantive changes per state per year; the volume is in classification, which the model does).

### Pricing hypothesis (validate in beta)
Tier 1 property calc: free (SEO/top-of-funnel). Professional plan: ₹2,500–5,000/user/month (Tiers 1–2, memo exports, workspace). Tier 3: per-matter. API: metered, floor ₹15k/month. Adjudication/historical mode gated to paid — it has zero free-alternative competition.

---

## 9. Quality: the Golden Test Suite (ship gate)

- ≥ 50 scenarios per state per MVP instrument class (~750+ total), each with lawyer-verified expected output and citation.
- Sources of truth: statute + notifications (primary), official state calculators (secondary, property instruments), practitioner verification (tertiary).
- **CI gate:** no rules version activates unless the state's golden suite passes 100%. A failing scenario is either a rules bug or a *law change discovery* — both are wins.
- Extraction eval set: **seed with 30–40 founder-supplied documents** (own files/network, anonymized, plus publicly available registered-deed formats), hand-labeled; grow toward 100 via consented beta uploads. Track per-field precision/recall; ship gate ≥ 95% precision on consideration/term/parties over the seed set. Founder to begin collecting seed documents before M4.
- Classification tree eval: 100 lawyer-labeled fact patterns per sensitive pair (lease vs L&L; works vs service); grey-zone recall matters more than accuracy — the tree must *escalate* rather than misclassify.

---

## 10. Metrics

North star: **verified computations per week by professional accounts.**
Supporting: memo exports (the "put it on file" action = trust), paid seats, API calls, freshness SLA adherence, canary divergence count (target: 0 unexplained), Tier 2 field-confirmation edit rate (proxy for extraction quality), escalation rate (healthy band 5–15%; near-zero means the tree is overconfident).

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Notification missed / gazette portal down | Multi-source crawl (gazette + IGR + finance dept + PIB), freshness banner auto-degrade, canary divergence detection |
| SRO computes differently in practice | Position output as pre-transaction computation per law-as-published; adjudication-path guidance; collect user-reported SRO divergences as data |
| A state's rules resist clean encoding | Escalate-by-design: unencodable pockets become explicit ESCALATE nodes, never silent approximations |
| Liability for a wrong number | Deterministic engine + citations + audit trail + T&Cs (information tool); professional users retain judgment; E&O insurance before scale |
| Leegality/portal builds this | Speed + depth: instrument coverage and versioned provenance are 12+ months of unglamorous work; also the partnership/exit path |
| Founder bandwidth | Phase discipline; circle-rate DB explicitly deferred; 3 states, not 10 |

---

## 12. Regulatory Positioning (Advocates Act, 1961)

StampDraft outputs **computation reports and analysis memos**, not legal opinions, and does not represent clients or hold itself out as practicing law. The buyer is the professional; the tool augments their judgment. Tier 3 memos are explicitly framed as analytical input for a qualified professional's review; the human-review add-on routes to independent empanelled advocates who issue anything opinion-shaped in their own name. T&Cs, product copy, and marketing must hold this line consistently. (Founder note: get a short written sign-off on this framing from a disputes lawyer before public launch.)

---

## 13. Rollout Plan

**Engagement scope: Phases 0–2 (milestones M0–M5 in the handoff prompt). Phase 3+ is parked pending beta feedback — do not build ahead.**

- **Phase 0 (wk 1–2 · M0–M1):** schema, rules engine core, golden-test harness, encode Delhi end-to-end (smallest surface) — prove the loop: statute → rules-as-data → deterministic output → passing suite. M1 (Delhi golden suite 100%, all PRs merged) is the thesis-proving gate.
- **Phase 1 (wk 3–8 · M2–M3):** Maharashtra + Karnataka encoding incl. 2015+ historical back-catalogue (batched-by-year PRs); Tier 1 UI + questionnaire trees; PDF memo export; historical mode; deficit/penalty module; beta with 10–15 friendly lawyers/CS (founder network).
- **Phase 2 (wk 9–14 · M4–M5):** Tier 2 upload/extraction/confirm; gazette monitoring pipeline live (emitting draft PRs); reconciliation canaries; workspace + audit log; paid beta.
- **Phase 3 (parked — fresh brief after beta):** Tier 3 analysis; UP + Telangana + Gujarat; registration-fee depth; area-classification lookup; API GA.
- **Phase 4 (later):** circle-rate/reckoner database; court-fees schedule (second product on same engine); e-stamp execution integration.

---

## 14. Verification Log (two review passes, as commissioned)

### Pass 1 — Legal engineer's review (loopholes caught & fixed)
1. **v0 assumed a single "value" input.** Wrong: bases split across consideration / market value / higher-of / formula (lease rent-multiples). → §5.1 formula bases added.
2. **Missing general charging rules** (S.4 principal instrument, S.5 distinct matters, S.6 multiple descriptions). These change answers materially in real transactions. → §5.4 + Flow C flags.
3. **Missing inter-state execution/differential duty** — daily real-world scenario, near-universally mishandled. → dedicated module, §5.4.
4. **No penalty/deficit module** in v0 despite adjudication being a named use case. → §5.6 + Flow D; discretionary penalties output ranges, not fake point estimates.
5. **Rounding rules omitted** — small but every practitioner notices, and being wrong by ₹100 destroys trust disproportionately. → §5.5.
6. **Relative-definitions for gift concessions vary by state** — encoding a generic "family" list would be a silent correctness bug. → per-state lists mandated.
7. **Maharashtra is a separate statute, not an amendment** — schema must be Act-aware per jurisdiction, not "ISA + deltas." → §6.1 `act` field is load-bearing.
8. **Advocates Act exposure** for anything called an "opinion." → §12 repositioning; Tier 3 renamed to analysis memo; human opinions only via independent advocates.

### Pass 2 — Engineering/product review (loopholes caught & fixed)
1. **Extraction trust:** v0 fed extracted fields straight to the engine. Unacceptable — one hallucinated consideration figure poisons a memo. → confirm-not-trust with source snippets (§6.4, Flow C).
2. **Version resolution bug class:** cross-refs ("same duty as No. 15") could resolve across versions if naively implemented. → snapshot-scoped resolution constraint (§6.1).
3. **UP in MVP was an ingestion trap** (Hindi gazette/portal, OCR risk on day one). → swapped for Karnataka; UP deferred to Phase 3 with OCR pipeline budgeted.
4. **Circle-rate DB scope creep** was implicit in v0's property flow. It's a different, bigger product. → explicit non-goal; user-supplied values + official links (§3).
5. **Tier 3 cost unbounded** without page caps and pass limits. → 60-page cap, model routing, per-matter pricing floor (§8).
6. **No ship gate existed** between "lawyer verified the encoding" and "users see it." → golden suite as CI gate; 100% pass required for activation (§9).
7. **DPDP obligations** unaddressed for uploaded deeds (personal data). → §7 retention, consent, compute-and-delete option.
8. **Audit reproducibility:** outputs weren't tied to a ruleset identity. → rules_version hash on every computation (§7) — this is also the liability shield.

### Residual open questions (for founder decision, not blockers)
- Beta pricing: seat-based vs matter-based for small firms — test both.
- ~~Whether the founder personally does first-pass legal verification~~ **DECIDED (v1.1): founder is the sole verifier**, including the historical back-catalogue; verification happens via GitHub PR review.
- Judgment corpus for Tier 3: buy access (SCC/Manupatra API) vs curate manually (~100 leading classification cases) — recommend manual curation; decision deferred with Phase 3.

### Pass 3 — Three-agent sanity review (AI / legal / software engineer)
Confirmed no cross-section redundancy and no over-indexing for MVP. Flags raised and dispositioned: (1) historical-mode verification cost — resolved by founder self-verification decision, full 2015+ coverage retained; (2) DPDP vs audit-snippet contradiction — fixed in §7 (confirmed values persist, snippets follow document lifecycle); (3) extraction eval chicken-and-egg — seed-set plan added to §9; (4) extraction model version now logged (§6.4); (5) canaries declared non-blocking (§6.6); (6) refunds of spoiled/unused stamps and exchange deeds noted as additional explicit non-goals for MVP (schema accommodates both later).

---

## 15. Note to the Executing Model

Execution is governed by `stampdraft-handoff-prompt.md` (milestones M0–M5, gate reports, PR-based verification). Build order is deliberate: **schema → engine → golden tests → Delhi encoding → UI.** The rules engine must be a pure, deterministic, fully-tested standalone library (with CLI) before any UI exists. Do not use an LLM anywhere inside the computation path. Treat every rule without a source citation as invalid. When encoding statutes, quote source text into `notes_for_reviewer` so PRs are self-contained. When statute text is ambiguous, encode an explicit ESCALATE node or flag it in the PR — never silently approximate. Prefer boring technology; the moat is the data, not the stack.

---

## Changelog

**v1.1 (July 2026)** — post three-agent review + founder decisions:
- Founder confirmed as sole legal verifier; verification cash cost internalized (§8); full 2015+ historical coverage retained (§13).
- Flag 2 fixed: audit retains confirmed field values + rules hash; document snippets follow document retention lifecycle (§7).
- Review-queue UI removed from scope; verification and gazette-pipeline updates flow through GitHub draft PRs with CI gates (§6.3).
- Engine specified as standalone importable library + CLI; TypeScript throughout; canaries non-blocking (§6.6).
- Extraction model version logged in audit (§6.4); seed eval-set plan added (§9).
- Engagement scope fixed at Phases 0–2 / M0–M5; Phase 3 parked pending beta (§13).
- Refunds (spoiled/unused stamps) and exchange deeds added as explicit non-goals (§3, §14 Pass 3).

**v1.0 (July 2026)** — initial draft with two-pass verification log (§14).
