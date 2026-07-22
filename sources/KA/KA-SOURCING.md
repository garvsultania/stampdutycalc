# Karnataka (KA) — sourcing dossier & confidence log

Karnataka Stamp Act, 1957 (Kar. Act 34 of 1957) — its own statute. Source-backed
view of every KA rate encoded or deferred; nothing verified until its PR is merged.
Encoding rules: `ENCODING-GUIDELINES.md`.

## Source (backed up in this folder)

**`karnataka-stamp-act-1957_dpal-karnataka.pdf`** — the official DPAL Karnataka
(Department of Parliamentary Affairs and Legislation) full Act, 95-page text-layer
PDF with amendment footnotes. HIGH-confidence primary source for both the Schedule
articles AND the Act sections (s.3B additional duty, s.34/s.39 penalty).

## Instrument status (wave 1)

| Instrument | Article | Encoding | Confidence |
|---|---|---|---|
| Conveyance / sale deed | 20(1) | 5% of market value + **s.3B 10%-of-duty infra cess** = 5.5%; first-sale flat 2% (≤20L) / 3% (20–35L) | **HIGH** (primary + s.3B primary) |
| — bare rate | 20(1) | `KA-ART20-rate`: 5% cross-ref target (rebaseable) for gift/lease/exchange | **HIGH** |
| Gift | 28 | select: family → area-fixed Rs 5,000 / 3,000 / 1,000; non-family → conveyance rate + cess | **HIGH** |
| Lease | 30 | term-table on (AAR+premium+fine+money advanced): ≤1y res 0.5% cap 500 / ≤1y comm 0.5% / ≤10y 1% / ≤20y 2% / ≤30y 3% / >30y conveyance-or-MV | **HIGH** |
| POA | 41 | Rs 100 (a–c); (d) Rs 200, (e) conveyance-rate, (ea) 2% dev — questionnaire forks | **HIGH** for flat cases |
| Penalty regime | s.34/s.39 | discretionary up-to-10× → RANGE | **HIGH** (primary) |

Status: **5 rule versions + 2 cess modifiers + 1 penalty regime; KA golden 17/17.**

## Two per-state relative lists, side by side (the PRD §5.5 point, proven)

| | Maharashtra (Art 34) | Karnataka (Art 28) |
|---|---|---|
| Structure | 3% (family) / Rs 200 (close family, residential/agri) | **area-based fixed**: Rs 5,000 / 3,000 / 1,000 |
| "Family" | husband, wife, brother, sister, lineal ascendant/descendant | father, mother, husband, wife, son, daughter, **daughter-in-law**, brothers, sisters, **grand children** |

Generalizing a single "family" list across states would be a silent correctness bug —
exactly what §5.5 warns against. Each is encoded as an explicit enumerated list.

## Wave 2 additions (done)

- **Local-body surcharge** — ENCODED (`KA-local-surcharge`): 2% (urban/BBMP, default) /
  3% (rural) of the stamp duty, on conveyance. MEDIUM confidence (secondary but strongly
  corroborated; reconciles exactly to the cited 5.6% Bangalore total). KA conveyance is
  now 5% + 0.5% cess + 0.1/0.15% surcharge = **5.6% urban / 5.65% rural**. PENDING: the
  primary municipal-law section; extension to gift.
- **Mortgage (Art 34)** — a=5% (conveyance), b=0.5%, hypothecation(d)=0.1/0.2% cap Rs 10L.
- **Bonds/affidavit/agreement** — affidavit (Art 4, Rs 20), security/guarantee bond
  (Art 47: ≤1k 0.5% / else Rs 200), indemnity (Art 29 → 47), works/service (Art 5(j) Rs 200).
- **Penalty (s.34/s.39)** — discretionary up-to-10× range (auto-resolves).
- **Classification tree** — lease-vs-L&L (both resolve to Art 30 lease; documents contrast with MH).

### DISCREPANCY logged (primary followed)
Some secondary sources describe KA conveyance as a GENERAL value slab (2% <20L / 3% 20-45L
/ 5% >45L). The PRIMARY Act text (Art 20(1) + 20(2A)) makes the general rate a flat 5% and
confines the 2%/3% concession to the FIRST SALE of a flat, capped at Rs 35L (not 45L).
Encoded per primary; flagged for founder confirmation of current registrar practice.

## Deferred to KA wave 3 / M2 back-catalogue

1. Surcharge extension to gift; the surcharge primary-law section.
2. **s.3B cess on the >30y (perpetuity) lease branch and on fixed family-gift duties**
   — modelling questions flagged (the statute's "10% on such duty" is literal but
   practitioners quote fixed family figures as all-in); excluded pending confirmation,
   with no golden asserting those cells.
3. **Family-lease proviso** (Art 30: Rs 5,000/3,000/1,000 to wife/husband/father/
   mother/son/daughter/brother/sister) — questionnaire branch.
4. Instruments not in wave 1: indemnity bond (Art 29 → Security Bond 47), security bond
   (Art 47), mortgage (Art 34), partnership (Art 40), agreement (Art 5 incl. dev
   agreements), exchange (Art 26), share transfer, affidavit, works/service, MOA
   (Art 33), classification trees.
5. **Back-catalogue to 2015 (M2, batched-by-year):** the current floor is 2016-04-01
   (the Act 07/2016 conveyance/gift substitution); pre-2016 rates are the back-catalogue.

## KA penalty nuance (for the memo, §5.6)
s.34 (admission in evidence) is a MANDATORY 10× the deficiency; the discretion to charge
less is the Collector's on adjudication (s.39/s.46A). Encoded as discretionary_range
[0, 10×] so the engine outputs a range; the product should surface both the adjudication
range and the s.34 worst case.
