# StampDraft Watchdog — PRD

**Status:** proposed, not built. **Owner:** founder. **Written:** 2026-07-16.

## 1. Why this exists

Our Karnataka corpus was wrong for five years because we encoded from a convenient PDF whose newest
amendment footnote was Act 55 of 2020, and nobody ever asked whether it was current. Our Maharashtra
corpus was ~3× wrong on works contracts because six amending Acts landed and we weren't watching.

The audits proved three things that define this product:

1. **The authoritative material is reachable.** A manual sweep of the Maharashtra e-Gazette (Part 8,
   195 rows) found four amending Acts — including one three days old that no commercial tracker had
   and that India Code was four Acts behind on.
2. **Nothing else is trustworthy.** Commercial trackers missed two Stamp Acts published *on the same
   day*. IGR Maharashtra serves two contradictory Schedule I PDFs, both live. India Code lags.
   "Official department page" is not evidence of currency.
3. **The law moves less than it feels.** Three states, five years, ~3 rate-affecting events. The
   failure was never volume — **detection was zero**.

So: detection is cheap, tractable, and worth more than any other work we can do. A weekly sweep would
have caught every error we found.

## 2. What it is

A scheduled, per-jurisdiction crawler that **detects, acquires, and archives primary sources**, and
raises a human-reviewable event when the law may have moved.

**Its output is evidence. Never conclusions.**

## 3. Non-goals — these are load-bearing, not caveats

The watchdog **MUST NOT**:

- **Extract rates, amounts, thresholds, or dates from documents.** Not with regex, not with an LLM.
- **Decide what an Act legally changes.** "Mah. XIII of 2026 amends s.52A" is a human's reading.
- **Write to `rules/` ever**, under any circumstance. It has no write access to the corpus.
- **Summarise a document.** A summary is a derived text that will eventually outrank the original —
  which is precisely how the Karnataka overcharge survived. Archive the PDF; let a human read it.
- **Use an LLM anywhere in its own pipeline.** Detection is a diff, not a judgement.
- **Assert "no change."** It may only assert *"sweep S succeeded over range R and returned N rows."*
  A failed sweep is not a quiet zero. See R1.

The crawler exists so a human reads the right document sooner. That is the whole product.

## 4. Core principle: absence of evidence is not evidence of absence

This is the same bug we just fixed in the engine, where a missing fact silently became a legal "no."
A sweep that 403s, times out, or silently paginates short **must surface as `failed`/`partial` and
must never be rendered as "nothing new."** Every claim of currency must be backed by a recorded,
successful sweep with a date range.

`audited_through` on a rule (see HANDOFF §4.3) should ultimately be derived from a successful sweep,
not typed by hand.

## 5. Architecture

```
sources.yaml            declarative registry: what to sweep, how, how often
  └─ adapters/          one per source SHAPE, not per state
       egazette_aspnet  ASP.NET __doPostBack forms (MH). No stable URLs — must emulate the form.
       static_index     paginated HTML tables (IGR circulars, DPAL year pages)
       indiacode        consolidated Acts (403s on default UA — needs a browser UA)
       prs_bills        early warning: bills before they are Acts
  └─ fetcher/           UA spoofing, retry+backoff, redirect handling, politeness
  └─ archive/           content-addressed blob store + provenance sidecar
  └─ differ/            run N vs run N-1 → new/changed rows
  └─ events/            emit JSON → GitHub PR/issue
```

Adapters are keyed by **source shape**, not jurisdiction — every state gazette that runs the same
ASP.NET stack reuses one adapter. This is what makes 36 jurisdictions tractable.

## 6. Data model

```ts
SweepRun {
  run_id, source_id, range_from, range_to,
  started_at, finished_at,
  status: "ok" | "failed" | "partial",     // R1: never silently zero
  rows_seen: number,
  pages_expected?: number, pages_fetched?: number,   // partial detection
  error?: string,
}

Document {
  sha256,                     // content-addressed; same doc twice = one blob
  source_id,
  title, gazette_date, part?, act_number?, bill_number?,
  fetched_at,
  retrieval: { url?, form_values?: Record<string,string> },  // R3: reproducible
  media_type,
  ocr: { status: "not_needed"|"ok"|"failed", lang?: string } | null,
}

Event {
  type: "new_document" | "source_unreachable" | "shape_drift" | "sweep_partial",
  source_id, run_id, documents?: sha256[], detail: string,
}
```

## 7. Requirements

| # | Requirement |
|---|---|
| **R1** | Every sweep records `status`. `failed`/`partial` raise an event. A failed sweep NEVER renders as "no change". |
| **R2** | Content-addressed archive (SHA-256). Re-fetching an unchanged doc is a no-op. Blobs are immutable. |
| **R3** | Provenance sidecar per document: the exact URL **or form values** that retrieved it, so any human can reproduce the fetch. e-Gazette has no stable URLs — record the form state. |
| **R4** | OCR is a **fallback with a recorded status**, never a silent substitution. Scanned Delhi PDFs defeat text extraction; Marathi IGR PDFs have legacy non-Unicode layers that **silently garble** (`pdftotext` renders `जा.क्र.का.15/...` as `TF.A1.15/a14GA...`). Use `tesseract -l mar+eng`. **Never trust an embedded text layer for Marathi.** Keep the original blob always. |
| **R5** | Keyword filters (`stamp`, `registration`, `mudrank`, `मुद्रांक`) are for **triage/alerting only**. Archive generously — a filter that decides what to keep will eventually drop the Act nobody expected. |
| **R6** | Idempotent and resumable. Re-running a range is safe and cheap. |
| **R7** | Polite: rate-limited, backoff on 429/5xx, identifiable UA, respects the site. These are government servers. |
| **R8** | **No LLM in the pipeline.** |
| **R9** | Shape drift detection: if a form field or table structure changes, emit `shape_drift` and fail loudly rather than returning zero rows. A silent zero from a changed page is the worst failure mode this system has. |
| **R10** | Sweeps are **date-ranged and recorded**, so "we have swept MH Part 8 through 2026-07-16" is a checkable fact, not a memory. |

## 8. Sources — v1

| Jurisdiction | Source | Shape | Priority | Notes |
|---|---|---|---|---|
| MH | e-Gazette `egazzete.mahaonline.gov.in` | `egazette_aspnet` | **P0** | Central Section(1) / Part 8 English(15) / Extra-Ordinary(1). Proven: found 4 Acts incl. one 3 days old. Also Part IV-B for notifications (women's concession, metro cess, ASR). |
| KA | DPAL `dpal.karnataka.gov.in` year pages | `static_index` | **P0** | Acts by year. Proven: complete 2021→2026 sweep. |
| KA | IGR `igr.karnataka.gov.in` | `static_index` | P1 | Fee tables, circulars. Fee table showed "Last Updated 2026-07-14". |
| DL | `revenue.delhi.gov.in` notifications / what's-new | `static_index` | **P0** | Scanned PDFs → OCR path mandatory. |
| DL | `mcdonline.nic.in` tax schedules | `static_index` | P1 | Transfer duty (DMC s.147) evidence. |
| ALL | India Code consolidated Acts | `indiacode` | P1 | Good spine, lags. 403s on default UA — send a browser UA. |
| ALL | PRS India bills | `prs_bills` | P2 | **Early warning** — a bill is weeks of notice before an Act. |

## 9. Acceptance criteria — we have ground truth

This is the rare case where the regression test has a **known answer**, established by manual sweeps
in the 2026-07-16 session. The watchdog is correct when:

1. **MH e-Gazette, Part 8 English Extra-Ordinary, `2025-04-09` → `2026-07-16`** returns ≥195 rows and
   the archive contains **Mah. Acts LXIII of 2025, XIII of 2026, XVI of 2026, and XXIX of 2026**.
   Missing **XVI of 2026** is the sharpest failure signal — every commercial tracker missed it because
   it was published the same day as XIII of 2026.
2. **MH e-Gazette Part IV-B, `2025-04-01` → `2026-07-16`** returns ≈767 rows including the
   commencement notification of 2026-01-09 (`Mudrank-2024/C.R.182/Mudrank-2`).
3. **KA DPAL 2021→2026** yields Acts 26/2021, 11/2022, 12/2022, 31/2022, 03/2023, 04/2024, 23/2024,
   30/2025, 42/2025 — and **no Stamp Act for 2026** (that negative must come from a *successful*
   sweep, not a failure).
4. Killing the network mid-sweep produces `failed`/`partial` and an event — **never** a clean zero.
5. A second identical run archives **zero** new blobs (R2/R6).

## 10. Definition of done

A weekly scheduled run that opens a PR titled e.g. *"Watchdog: 2 new documents — MH Part 8"* with the
archived PDFs, their provenance, and the sweep record — and a human decides what, if anything, it
means for `rules/`.

## 11. What this unlocks

- `audited_through` stops being a hand-typed claim and becomes derived from a recorded sweep.
- Encoding a new state starts from a *complete, dated* document set instead of a Google search.
- The maintenance treadmill collapses from "stay vigilant across 36 jurisdictions" to "review a
  handful of PRs a year" — which our own data supports: ~3 rate-affecting events across 3 states in
  5 years.
- It is the moat. Nobody else in this market has provable currency, because nobody is sweeping
  gazettes.
