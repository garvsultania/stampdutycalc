# Delhi (DL) — sourcing dossier & confidence log

Purpose: a self-contained, source-backed view of every Delhi rate encoded or
deferred, so the founder (sole verifier) can confirm numbers without leaving the
repo. Nothing is "verified" until its PR is merged (`verified_by`/`verified_on`
stay null until then). Encoding rules: see `ENCODING-GUIDELINES.md` (repo root).

## Sources (backed up in this folder)

1. **`indian-stamp-act-1899-schedule-I_delhi-revenue-dept.pdf`** — Indian Stamp Act
   1899 **central Schedule I** as hosted by the Delhi Dept. of Revenue. Authoritative
   for STRUCTURE (article numbers, cross-refs, base-types) and for central articles
   (23A part performance; 62 share transfer pre-amendment + S.O. 130(E)/2004 rates
   and the 5-paise rounding proviso).
2. **`schedule-I-A-delhi-rates_reproduction.pdf`** — reproduction of **Schedule I-A
   (Delhi rates)**. Secondary source; internally consistent with official figures.
   KNOWN DEFECT: Art 46 duty column slipped one row (caught by founder, Q3 ruling).
3. **Delhi Dept. of Revenue property-registration page** (official) — operative
   combined sale/gift rates (6%/4%). NOTE: does not yet reflect the 10-Jul-2023
   transfer-duty hike for >₹25L — a live canary-divergence specimen (M5), as is its
   stale share-certificate guidance.

## Founder rulings (2026-07-16) — the Q1–Q6 review record

| # | Ruling | Key authorities |
|---|---|---|
| Q1 | "Same duty as Conveyance (No. 23)" imports the **Schedule rate only** — 3% (2% women). Transfer duty is a separate municipal levy (DMC Act 1957 **s.147**) on a closed instrument list (sale, exchange, gift, mortgage-with-possession, lease-in-perpetuity, contract-for-transfer), with its own per-instrument base (contract-for-transfer: 90% of consideration; lease-in-perpetuity: 1/6 of first-50-years' rent). Release/relinquishment deeds attract **no** transfer duty. | Delhi Towers Ltd. v. GNCTD (Del HC); Hari Kapoor v. SDMC (Del HC, 2019); DMC Act 1957 s.147 |
| Q2 | Bond No. 15: the "2% and 0.5%" text is correct — general bonds **2%**; local-authority bonds **0.5%**; no cap. Reconciles with the 2%-of-rent 11-month figure via the lease cross-ref chain. | Sch I-A Art 15 + practitioner corroboration |
| Q3 | Partnership Art 46: duty column slipped one row. Correct: (a) capital ≤ ₹500 → small fixed duty (**PENDING — clean bare act needed**); (b) else → **1% of capital, ceiling ₹5,000**; (B) dissolution → **₹200**. | Founder ruling + multi-source corroboration |
| Q4 | Share transfer: from **1-Jul-2020**, **0.015%** of consideration uniform (incl. physical SH-4); before, 0.25% (Art 62(a) as amended 2004). Gifts of shares (nil consideration) → nil duty. Payer (s.29) PENDING. Share-certificate issue (Art 19, 0.1%) is a separate instrument. | Finance Act 2019; MoF notifs 10-12-2019 & 30-03-2020; DEA FAQs |
| Q5 | Transfer duty timeline: 2015→9-Jul-2023: **3% (M) / 2% (F)** all values. From **10-Jul-2023**: ≤₹25L unchanged; >₹25L **4% (M+other) / 3% (F incl. third gender)** — cliff, not marginal. Render as a separate breakup line. Joint split of the 5% combined total PENDING vs DORIS. | MCD notification 10-Jul-2023 |
| Q6 | Rounding: **none** as the Delhi default. Only exception: 2004 central reduction order (Arts 13, 14, 27, 37, 47, 49, 52, 62(a)) — "rounded off to the next five paise". No whole-rupee rounding encoded as law. | S.O. 130(E)/2004 (corrected S.O. 522(E)/2005) |

## Instrument status (all 15 MVP instruments)

| # | Instrument | Encoding | Confidence | Pending items |
|---|---|---|---|---|
| 1 | Conveyance / sale deed | 3%/2% stamp (joint 2.5 PENDING) + transfer-duty modifiers (era + ₹25L threshold) | **HIGH** | joint split vs DORIS |
| 2 | Agreement to sell | Possession fork: Art 23A (90% of conveyance + TD on 90% base) vs Art 5(c) ₹50 | MED-HIGH / MED | no-possession ad valorem practice; set-off memo (M3) |
| 3 | Lease | Art 35 banded formula (Bond→Conveyance by term) + premium-as-conveyance | MED-HIGH | band (vi) boundary OCR; >100y/perpetuity escalates |
| 4 | Leave & license | Cross-ref to lease via Art 35 "any agreement to let" | MEDIUM | registrar-practice confirmation |
| 5 | Gift deed | Cross-ref conveyance on property value + gift TD modifiers | **HIGH** | hike-applies-to-gift assumption; joint donee |
| 6 | General POA | ₹50 (clauses c/d/e) | MEDIUM | clause (f) conveyance-rate fork → questionnaire; (g) per-person |
| 7 | Special POA | ₹50 (clause c); ₹20 registration-only noted | MEDIUM | default clause choice |
| 8 | Mortgage with possession | Cross-ref conveyance on amount secured + TD modifiers | MED-HIGH stamp / **PENDING TD base & gender** | verify vs DORIS |
| 9 | Mortgage without possession | 2%, ceiling ₹2,00,000 | MEDIUM | clause (c) collateral security fork |
| 10 | Loan / hypothecation | Art 6: 0.5% cap ₹50k (>3mo/demand); ≤3mo half | MED-HIGH | BoE-accompanying exemption flag |
| 11 | Indemnity bond | Art 34 → Art 57 → (≤1k: 2%; else ₹100) | MED-HIGH | — |
| 12 | Guarantee / surety bond | Art 57 switch (≤1k: Bond 15; else ₹100) | MED-HIGH | — |
| 13 | Partnership deed | 1% of capital, cap ₹5,000; dissolution ₹200 | MED-HIGH | clause (a) ≤₹500 stub (escalate in questionnaire) |
| 14 | LLP agreement | Cross-ref partnership (practice-based) | **PENDING** | founder confirm practice/notification |
| 15 | Affidavit | ₹10 | MEDIUM | exemption path (court/enrolment/pension) |
| 16 | Works contract | Art 5(c) ₹50 (no specific Delhi entry) | MEDIUM | confirm no ad valorem notification |
| 17 | Service agreement | Art 5(c) ₹50 (Sch I-A routes 'agreement for service' to Art 5) | MED-HIGH | — |
| 18 | Share transfer (physical) | v1 0.25% + 5-paise ceil (→30-Jun-2020); v2 0.015% (from 1-Jul-2020) | **HIGH** | payer (s.29) |

Status: **22 rule versions + 12 modifier versions + 2 classification trees; Delhi
golden suite 58/58 passing.**

## Remaining PENDING_VERIFICATION register (for founder, in priority order)

1. **Joint (M+F) component split** — combined 5% verified; stamp/transfer 2.5+2.5
   assumed. Also: does the >₹25L hike change the joint total? (No golden asserts
   joint >₹25L post-hike.) → verify against DORIS output.
2. **Transfer duty on mortgage-with-possession** — base assumed = amount secured;
   gender rates assumed standard. → DORIS.
3. **Hike (10-Jul-2023) applicability to gift / mortgage / contract-for-transfer**
   — encoded as applying (s.147-general reading); confirm notification text.
4. **Partnership clause (a)** (capital ≤ ₹500) — exact fixed figure from a clean
   bare act; questionnaire escalates ≤₹500 meanwhile.
5. **Lease band (vi)** (>30 ≤100y → 4× AAR) — OCR-ambiguous; and the >100y/
   perpetuity base text (stamp: central uses 1/5 of first-50y rents; Delhi text
   truncated; TD base 1/6 of first-50y rents per Q1) — currently escalate-by-error.
6. **LLP-as-partnership** practice; **L&L-under-Art-35** practice; **ATS
   no-possession** ₹50 vs ad valorem practice; **share-transfer payer** (s.29);
   **GPA clause (f)** questionnaire fork; **women 2% via cross-ref** for
   non-purchase instruments (leases/mortgages currently omit transferee_category →
   3% default).

## Explicitly out of scope, recorded for later
- Release/relinquishment deed: **no transfer duty** (Hari Kapoor v. SDMC, 2019) —
  encode when the instrument is added (not in MVP 15).
- Share-certificate issue (Delhi Art 19: ₹1/₹1,000): separate instrument, not MVP.
- Lease-in-perpetuity TD base (1/6 of first-50y rent) — with perpetuity stamp leg.
