# Maharashtra (MH) — sourcing dossier & confidence log

Maharashtra Stamp Act, 1958 (Bom. Act LX of 1958) — its OWN statute, not ISA+deltas
(PRD §14 Pass1.7). Source-backed view of every MH rate encoded or deferred; nothing
is verified until its PR is merged. Encoding rules: `ENCODING-GUIDELINES.md`.

## Source (backed up in this folder)

**`maharashtra-stamp-act-schedule-I-II_igr-maharashtra_upto-2022-06-01.pdf`** — the
official IGR Maharashtra Schedule I & II, text-layer PDF "as modified upto the 1st
June 2022", with amendment footnotes. HIGH-confidence primary source for the Schedule
rates. (Full-Act sections — s.34 penalty, s.32A, s.19 differential — are in the India
Code MSA text, not this Schedule PDF.)

## Instrument status (wave 1)

| Instrument | Article | Encoding | Confidence | Notes |
|---|---|---|---|---|
| Conveyance / sale deed | 25 | area-based: 5% (corp/urban), 5% (council/NP/MMRDA-rural), 4% (gram panchayat), 3% (movable), on true market value; women −1% residential (from 1-Apr-2021) | **HIGH** (Schedule) | **metro cess (1%) + LBT PENDING** |
| Gift | 34 | select on gift_relation: close-family residential/agri → Rs 200; family → 3%; else → conveyance rate | **HIGH** | per-state relative list (§5.5) |
| Lease | 36 | conveyance rate on term-% of market value: ≤5y 10%, ≤10y 25%, ≤29y 50%, else 90% | **HIGH** | premium/deposit = consideration (Expl. I) |
| Leave & License | 36A | ≤60mo: 0.25% of (rent + non-refundable + 10% of refundable); >60mo → lease | **HIGH** | MH differentiator |
| Memorandum of Association | 39 | 0.2% of share capital, min Rs 1,000, **cap Rs 50,00,000**; +AoA → Rs 1,000 | **HIGH** | the cap showcase (§5.2) |
| POA | 48 | Rs 500 (a–e, h) | **HIGH** for flat cases | (f)/(g) conveyance-rate forks → questionnaire |

Status: **6 rule versions + 1 modifier + MH golden 20/20.**

## Deferred to MH wave 2 / M2 back-catalogue

1. **Metro Cess (1%) + Local Body Tax** — separate surcharges on conveyance/lease in
   MMR, Pune, Nagpur, Nashik etc.; the effective Mumbai rate is ~6–7%, not 5%. Need
   the specific surcharge notifications + area lists. Model as modifiers (Delhi
   transfer-duty pattern). **Until then, MH conveyance/lease totals are STAMP DUTY
   ONLY — do not treat as the all-in figure.**
2. **Penalty regime (MSA s.34)** — 2%/month agreed across sources, but the CAP is
   genuinely conflicting (one primary-text-citing source says "double" = 200%; several
   practitioner sources say "four times" = 400%). NOT encoded pending a read of the
   actual s.34 text — never guess a penalty cap. The penalty ENGINE is built/tested;
   only the MH regime datum is pending.
3. **Mortgage (Art 40)** — (a) with possession = conveyance on amount secured; (b)
   without possession shows BOTH "0.1% min Rs 100" and "0.3% max Rs 20 lakh (consortium
   Rs 50 lakh)" lines in the OCR (Mah 3 of 2021 substitution) — AMBIGUOUS which is the
   operative structure; flagged per the two-column guardrail, not guessed.
4. **Back-catalogue versions (M2, batched-by-year to 2015):** pre-2017 conveyance
   (council 4% / gram 3%); pre-2015 POA (Rs 100); 2013–2017 L&L (0.25% formula existed
   from 1-May-2013 but its >60-month tail needs the pre-2017 conveyance rate). Current
   MH floor is set at 2017-09-07 (the conveyance-rate amendment) so the cross-ref chain
   resolves; earlier eras are the back-catalogue.
5. Instruments not in wave 1: agreement (Art 5, incl. the g-a development agreement =
   conveyance rate), mortgage, indemnity bond (Art 35 = Rs 500), partnership, share
   transfer, works/service, affidavit (Art 4), leave-license classification tree.

## Inter-state note (§5.4)
The differential-duty engine is live (`computeInterStateDifferential`). A deed executed
in Delhi for Maharashtra property is chargeable in MH with MH duty less the DL duty paid
(no refund if DL exceeds MH). Exercised by unit tests; a cross-state golden fixture needs
the golden harness extended to two inputs (M2 wave 2 / M3).
