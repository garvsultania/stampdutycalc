# StampDraft — Session Handoff

> **Historical calculator handoff (2026-07-16).** Its legal traps and founder-only
> decisions remain relevant, but its branch/test/status snapshot is superseded by
> [`PHASED-EXECUTION-PLAN.md`](./PHASED-EXECUTION-PLAN.md) and
> [`WATCHDOG-HANDOFF.md`](./WATCHDOG-HANDOFF.md).

Written 2026-07-16. Read this plus `DECISIONS.md` and `ENCODING-GUIDELINES.md` before touching anything.

---

## 1. Where the code is

All work is on **`m3-frontend`** (22 commits ahead of `main`). Branches `delhi-wave-1` (2) and
`m2-maharashtra` (14) are ancestors of it in substance. **Nothing has been merged to `main`.**

Merging is not a formality here — merge *is* verification (founder is the sole verifier).

```bash
pnpm install
pnpm check          # typecheck + validate:rules + golden + test — the gate. Currently GREEN.
                    # 98/98 tests, 166/166 golden, 0 validation errors.
cd apps/web && pnpm dev     # frontend on :3000
```

**Do not run `next build` while a dev server is live** — both write `.next` and the build wipes
the dev server's CSS, producing an unstyled page that looks like a design failure. It isn't.

The **workspace needs a real Postgres** (`DATABASE_URL` in `apps/web/.env.local`). Without one it
degrades to a setup card by design; the calculator itself needs no database. See
`packages/store/README.md`. PGlite cannot load inside Next's runtime — it is **test-only**. Do not
try to route around this again; two approaches were tried and both failed (documented below).

Production and non-loopback deployments also require a 32-byte-or-longer
`STAMPDRAFT_MEMO_CAPABILITY_SECRET`. Memo links are five-minute, firm-scoped capabilities; a
loopback `next dev` session alone receives a development fallback. See `apps/web/.env.example`.

---

## 2. The state of the truth

**`verified_on` is blank on every rule in the corpus. Zero rules are lawyer-verified.**
Everything below is drafting + sourcing, not law you can rely on yet.

| | Delhi | Maharashtra | Karnataka |
|---|---|---|---|
| Instruments | 16 | 10 | 7 |
| Rates current? | **Yes** (positively evidenced) | Stale — flagged | **Badly stale** — flagged |
| Source quality | Good | Our PDF is 4y stale | **Our PDF is 5y stale** |
| Registration fees | Researched, not encoded | Researched, not encoded | Researched, not encoded |

12 rule files now carry machine-readable `pending_verification` flags. The engine **refuses** on
flagged cells rather than emitting a number (`severity: "refuse"` is the default; `"warn"` is an
explicit opt-down for doubt that doesn't touch the figure). Flags are **date-scoped**, so verified
eras still compute and only stale-today cells refuse.

### Known-wrong, currently refusing

- **KA Art 20(2A)(iii)** — missing 35–45L affordable band @3% (Act 26 of 2021). We fall through to
  5% → **2-point overcharge on the most common retail transaction in the state**, since Oct 2021.
- **KA ~29 Articles** — rewritten by Act 04 of 2024 (in force 03-02-2024): affidavit ₹20→₹100, POA,
  Art 5(j), Art 47, Art 34 mortgage (rate changed *and* ₹10L cap removed), Art 40/40-A (3%→5%),
  Art 52. **Art 28 gift and Art 30 lease are untouched** and still compute.
- **MH Art 63 works contract** — threshold ₹10L→₹5L, rate 0.1%→0.3% (Mah. 9 of 2025, 14-10-2024).
  We returned ₹49,500 on a ₹5cr contract; law says ₹1,49,000.
- **MH Art 47 partnership** (cap ₹15k→₹50k), **MH Art 4 affidavit** (₹100→₹500).
- **MH Art 54 security bond** — not stale, **wrong version**. Encoder read the footnote
  ("Prior to substitution, it read as under-") instead of the operative column.
- **DL transfer duty, joint >₹25L** — split unsourced.

19 goldens across MH/KA now assert the refusal instead of a figure — they were tests encoding bugs.

---

## 3. Founder decisions blocking work

Nobody but you can answer these. Each is parked, not guessed.

1. **DL registration fee — is the ₹50,000 cap alive?** The 2010 notification states it plainly; every
   commercial site says "1%, no cap"; the official page omits it — and that same page is
   demonstrably stale on rates. On a ₹5cr flat: ₹50,000 vs ₹5,00,000.
2. **KA surcharge scope.** Statute (KMC s.140 etc.) reaches *sale, gift, mortgage, exchange, lease in
   perpetuity*. We apply it to conveyance only → we **undercharge** the rest. Note the deliberate-looking
   asymmetry: s.3B cess covers *settlement, no mortgage*; surcharge covers *mortgage, no settlement*.
   **Do not share a modifier between them.**
3. **MH metro cess city list.** We encode 6 cities. **Nagpur is unverified** (practitioner sources
   only, no notification found). The cess reaches only sale/gift/usufructuary mortgage — **our lease
   claims it and likely over-charges**. Also: Mumbai is 6% (MMC Act 1888 s.144F, no s.149A) while
   Pune/Thane under the 1949 Act may be 7% (s.149B + s.149A). Our binary `metro_cess_city` fact
   **cannot express a per-city difference** — needs a city-level fact and a re-model.
4. **DL GPA circular of 07-07-2026.** Non-blood-relative GPA now routes to the Collector for
   adjudication before registration. Changes POA treatment.
5. **KA Acts 30 of 2025 and 42 of 2025** commence "on such date as the State Government may
   notify" — **commencement notifications not located**. Act 42 makes POA-for-transfer compulsorily
   registrable. Absence of evidence is not evidence of absence.

---

## 4. Next steps, in order

**1. Re-source Karnataka from scratch.** `sources/KA/karnataka-stamp-act-1957_dpal-karnataka.pdf` is a
stale print (newest footnote: Act 55 of 2020). There is **no clean consolidated text** — the published
DPAL consolidation stops at Act 03 of 2023 and excludes the big 04/2024 revision. It must be assembled
from the base Act + Acts 26/2021, 11/2022, 12/2022, 31/2022, 03/2023, 04/2024, 23/2024, 30/2025.
Use the gazette-sweep method (§11 of the guidelines), not trackers.

**2. Add a currency axis to the sourcing rule.** See `DECISIONS.md` D17. Every source PDF must carry
the date it was consolidated to, and that date belongs in the citation. Today a stale primary
outranks a correct secondary — that is exactly how the KA overcharge survived five years.

**3. Golden suites must anchor to today.** Every MH golden was dated 2024-06-01, so 166/166 stayed
green while the engine was 3× wrong for anything executed now. Proposed: an `audited_through` field
on `VersionMeta` — a human's claim that "I looked for amendments up to this date and found none" —
plus a CI check that fails when a live rule has no audit date or one older than N months. **This was
deliberately NOT half-built**: a stub test that reports without failing is theatre.

**4. Re-encode the flagged MH/KA rules** from primary sources, as new eras (append-only, never mutate).

**5. Registration fees.** Engine needs no new capability. Note the shapes:
   - **DL**: 1% of higher of consideration/circle rate, **cap ₹50,000** (pending decision #1). Lease
     ₹1,000 flat, not 1%. The ubiquitous ₹100 pasting charge has **no notification** — a rate without
     a source, which our guidelines forbid.
   - **MH**: **not 1%.** Stepped: ₹100 + ₹10 per ₹1,000-**or-part** above ₹10,000, cap ₹30,000, min
     ₹100 (not the ₹1,000 everyone repeats). "Or part" is a ceiling step — use the existing `ceil_div`.
     A flat 1% undercharges every partial slab. Base **piggybacks on the stamp-duty base** — do not
     re-derive. Gift-to-family ₹200 flat, but with a **different relative list than Art 34** — do not
     reuse the predicate.
   - **KA**: **2%, not 1%**, w.e.f. 31-08-2025. Not uniform: lease ≈0.5%, DTD 0.1% capped ₹25k,
     mortgage-without-possession capped ₹25k, POA/gift-family/will are fixed amounts. A flat "2%"
     model is wrong for ~half the instrument set. The parent Table of Fees **is not published
     anywhere official** — may need an RTI.

**6. Then, and only then, founder verification pass** on the three states.

---

## 5. Traps that have already bitten us

- **The two-VERSION trap** (guidelines §9). Hosted Acts print the operative column *and* the
  superseded text in a footnote. The footnote is history; the column is law. MH Art 54 shipped the
  footnote.
- **"Official department page" ≠ current.** IGR Maharashtra serves a Schedule I "upto 01-06-2022" at
  one URL and "upto 15-01-2018" at another. **Both are live right now.**
- **Trackers miss things.** Maharashtra published **two different Stamp Acts on the same day**
  (XIII and XVI of 2026, both 07-04-2026); every commercial tracker caught the first, missed the
  second. A third landed 13-07-2026 with zero secondary coverage.
- **AI search summaries were actively wrong** in this work — attributing s.53B to the wrong Act,
  dating the women's lock-in deletion to 2026 when it was 2023. Quote only from a document actually
  fetched.
- **Scanned government PDFs defeat text extraction.** An earlier "NOT FOUND" on Delhi's Schedule I-A
  was a tooling artefact, not an absence — read them with a vision-capable reader.
- **Marathi IGR PDFs have legacy non-Unicode text layers that silently garble.** OCR with
  `tesseract -l mar+eng`; never trust the embedded text.
- **A missing fact is not a "no."** `Modifier.requires_facts` exists because a modifier gated on
  `applies_when` used to drop out silently when its fact was absent — asserting a legal conclusion
  nobody reached. Six MH goldens had encoded that bug as the expected answer.
- **PGlite in Next**: fails in dev *and* prod (`instanceof URL` across module realms). The
  wire-protocol workaround (`pglite-socket`) accepted connections then reset them. Both were tried
  and removed. Use real Postgres.

---

## 6. Deliberately not done

- **Lawyer review-queue UI** — founder directive; verification happens via GitHub PRs.
- **`audited_through` / staleness CI** — designed, not built (see step 3). Don't half-build it.
- **Registration fees** — researched thoroughly, encoded nowhere, pending decisions above.
- **Frontend polish** — founder called it "very vibe coded"; deprioritised in favour of correctness.
  Still true, still deprioritised.
- **Workspace end-to-end run** — store layer is proven (15/15 tests against real Postgres semantics
  via PGlite), but the web layer on top has **never been exercised** for lack of a Postgres in the
  dev environment.
- **M4/M5 external provider/deployment completion**, foreign-executed instruments,
  exchange/settlement, KA pre-2016 back-catalogue, and `min()`-over-charges. The later
  review series adds fail-closed authentication, Tier 2 upload/confirmation/lifecycle,
  PDF memos, migrations, and backup contracts; production IdP, extraction, backup, and
  Postgres integrations still require deployment credentials and drills.
