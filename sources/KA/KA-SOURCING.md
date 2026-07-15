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

## Deferred to KA wave 2 / M2 back-catalogue

1. **Local-body surcharge (2% urban / 3% rural OF stamp duty)** — commonly cited but
   sourced only secondarily (it sits in municipal/panchayat law, not the KSA). NOT
   encoded pending the primary provision; **KA conveyance totals are 5% + s.3B cess
   (5.5%) ONLY** — the effective urban figure (~5.6%) awaits the surcharge.
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
