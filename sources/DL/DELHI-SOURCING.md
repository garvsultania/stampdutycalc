# Delhi (DL) — sourcing dossier & confidence log

Purpose: give the founder (sole verifier) a self-contained, source-backed view of
every Delhi rate encoded or deferred, so numbers can be confirmed without leaving
the repo. Nothing here is "verified" until the corresponding PR is merged
(`verified_by`/`verified_on` stay null until then).

## Sources (backed up in this folder)

1. **`indian-stamp-act-1899-schedule-I_delhi-revenue-dept.pdf`** — the Indian Stamp
   Act 1899 **central Schedule I**, as hosted by the Delhi Dept. of Revenue
   (revenue.delhi.gov.in/.../act/schedule-i.pdf). **Authoritative for STRUCTURE**
   (article numbers, cross-references, base-types: lease formula, gift=conveyance,
   indemnity=security-bond, mortgage with/without possession, POA variants). Its
   rupee/anna figures are the un-amended central rates — **NOT** Delhi's operative
   rates.
2. **`schedule-I-A-delhi-rates_reproduction.pdf`** — a reproduction of **Schedule
   I-A (as applicable to Delhi)** with modernised rupee/percentage rates
   (lealte.com). Internally consistent with the official figures below; treat as a
   **secondary** rate source pending confirmation against the Delhi Gazette.
3. **Delhi Dept. of Revenue, Property Registration page** (official, primary) —
   https://revenue.delhi.gov.in/revenue/property-registration — sale deed, gift,
   will, share-certificate operative rates.

## Instrument status (15 MVP instruments, PRD §3)

| # | Instrument | Delhi rate (as sourced) | Source / confidence | Status |
|---|---|---|---|---|
| 1 | Conveyance / sale deed | 6% male / 4% female / 5% joint on higher-of(consideration, market value) | Official Dept. of Revenue — **HIGH** | **Encoded** |
| 2 | Agreement to sell | Charged as Conveyance (Sch I-A note ties "agreement to sale" to conveyance rates; duty adjustable against final sale deed) | Sch I-A — MEDIUM | Deferred (Q1, set-off nuance) |
| 3 | Lease | Delhi term-bands: <1y & 1–5y → Bond(15) on rent; >5–10y → Conveyance on 1× AAR; >10–20y → 2× AAR; >20–30y → 3× AAR; >30–100y → 4× AAR; perpetuity → Conveyance; no-term → 3× AAR (first 10y); + premium as Conveyance | Sch I-A — MEDIUM (one band OCR-ambiguous) | Deferred (Q1, Q2) |
| 4 | Leave & license | No distinct Sch I-A article; charged as lease/agreement | — | **Escalate** (classification tree built) |
| 5 | Gift deed | 6% male / 4% female donee, on property value | Official — **HIGH** | **Encoded** |
| 6 | General POA | Rs 50 (clauses c/d/e); Rs 50/person (g); **Conveyance rate if for consideration to sell immovable (f)** | Sch I-A — MEDIUM | **Encoded** (clause f escalation noted) |
| 7 | Special POA | Rs 50 (single transaction, c); Rs 20 (registration-only, a) | Sch I-A — MEDIUM | **Encoded** |
| 8 | Mortgage with possession | Same duty as Conveyance (No.23) on amount secured | Sch I-A — MEDIUM | Deferred (Q1) |
| 9 | Mortgage without possession | 2% of amount secured, ceiling Rs 2,00,000 | Sch I-A — MEDIUM | **Encoded** |
| 10 | Loan / hypothecation agreement | Art 6 (deposit of title-deeds) / agreement | Sch I-A — LOW | Deferred |
| 11 | Indemnity bond | Same duty as Security Bond (No.57) → Bond (No.15) | Sch I-A — blocked by Q2 | Deferred (Q2) |
| 12 | Guarantee / surety bond | Bond (No.15) or Letter of Guarantee = Agreement | Sch I-A — blocked by Q2 | Deferred (Q2) |
| 13 | Partnership deed | (a) capital ≤ Rs 500 → 1% (ceiling Rs 5,000); (b) other → Rs 200 — **appears inverted in source** | Sch I-A — LOW | Deferred (Q3) |
| 14 | LLP agreement | Charged as agreement/partnership; Delhi-specific treatment unclear | — | **Escalate** |
| 15 | Affidavit | Rs 10 (court/enrolment/pension affidavits exempt) | Sch I-A — MEDIUM | **Encoded** |
| 16 | Works contract / service agreement | Art 5 (Agreement); classification-sensitive | Sch I-A — LOW | **Escalate** (classification tree built) |
| 17 | Share transfer (physical) | Central Art 62 (amended 2019/2020 uniform regime); Share Certificate = Re 1 / Rs 1,000 (official) | Mixed — LOW | Deferred (Q4) |

## Open legal questions (need founder decision before those PRs merge)

- **Q1 — "same as Conveyance" rate for non-sale instruments.** Lease, mortgage-
  with-possession, agreement-to-sell cross-refer to "Conveyance". Do they use the
  **pure Schedule I-A stamp rate (5% general)** or the **transfer-inclusive
  operative rate (6/4/5%)**? And do the women concession / transfer duty apply to
  them? Recommendation: encode a separate `DL-ART23-conveyance-stamp` base rule
  (5% general, no transfer duty, no gender split) as the cross-ref target, keeping
  the sale-deed rule as the transfer-inclusive operative figure.
- **Q2 — Bond No.15 slab.** The Schedule I-A reproduction text for Art 15 is
  garbled ("2% and 0.5% on bond issued by the local authority"). Need the
  authoritative Delhi Bond-15 rate — it is the cross-ref target for indemnity /
  guarantee / security bond / short-term lease / settlement, so several PRs are
  blocked on it.
- **Q3 — Partnership Art 46.** Source shows capital ≤ Rs 500 → 1% (max Rs 5,000)
  but larger capital → flat Rs 200, which reads inverted. Confirm correct reading.
- **Q4 — Share transfer (physical).** Post-2019 Finance Act amendments imposed a
  uniform stamp-duty regime (0.015% on delivery-based transfer via depository).
  Confirm the operative rate for a physical (SH-4) transfer in Delhi.
- **Q5 — Transfer duty & effective dates.** Confirm the exact transfer-duty rate
  (~1%?), any threshold (Rs 25 lakh?), whether to render stamp vs transfer duty as
  separate breakup lines, and the exact notification `effective_from` dates
  (needed for historical mode, M2). Current encodings use 2020-01-01 as a
  conservative current-law floor.
- **Q6 — Rounding.** Confirm the Delhi rounding rule for stamp duty (encoded as
  `none` pending confirmation).

## Encoded this wave (validated, golden-passing)

Conveyance/sale deed, gift deed, affidavit, general POA, special POA, mortgage
without possession — 6 rules, 13 golden scenarios, 100% passing. Plus two
classification trees (lease vs leave-&-license; works vs service).
