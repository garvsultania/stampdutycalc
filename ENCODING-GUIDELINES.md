# Encoding Guidelines (standing instructions — founder-mandated)

Rules for turning statute/notification text into rules-as-data. These exist because
the failure modes below have already happened once. Violating them is a review-blocking
defect regardless of whether the number happens to be right.

## 1. Two-column PDFs: quote BOTH columns, raw
Any schedule entry extracted from a two-column PDF (description | duty) must quote
**both columns' raw text** in `notes_for_reviewer`/`quoted_text` — not a fused
paraphrase. Origin: Delhi Sch I-A Art 46 (Partnership), where the duty column had
slipped one row in every online copy, producing a fluent, plausible, **wrong** rule
("capital ≤ ₹500 → 1% with ₹5,000 ceiling"). A fused paraphrase hides the slip; raw
two-column quotes expose it.

## 2. Economic absurdity = auto-escalate
Any entry whose rate is economically absurd (a percentage of a tiny bounded base
carrying a large ceiling; a cap below the obvious minimum computation; a rate 10×
out of line with neighbouring entries) is an **auto-escalate** — encode a
`PENDING_VERIFICATION` stub or omit the clause, never a best-guess. "1% of ≤₹500
subject to a ₹5,000 ceiling" should never have survived to a draft encoding.

## 3. PENDING_VERIFICATION convention
When a sub-clause / split / boundary is unverified but the enclosing figure is
verified: encode the verified total, mark the unverified component
`PENDING_VERIFICATION` in `notes_for_reviewer`, ensure **no golden case asserts the
unverified cell**, and list it in the state sourcing dossier. Example: Delhi joint
(M+F) conveyance — combined 5% verified; 2.5+2.5 stamp/transfer split pending.

## 4. Escalate-by-error boundaries are deliberate
A `switch`/`band` without a terminal case is a **feature** when the tail of the
statute is unverified (Delhi lease > 100y / perpetuity). The engine throws instead of
approximating. Document the deliberate gap in `notes_for_reviewer` and cover it with
an `expect.error` golden case.

## 5. Canonical fact vocabulary
- `transferee_category`: `male` | `female` | `joint` | (anything else → default rate).
  Used for buyer, donee, lessee, mortgagor — one key across instruments so modifiers
  compose.
- `obligor_category`: `local_authority` | default.
- Lease/L&L terms are **integer `term_months`** (11-month L&L = 11; 1 year = 12).
  Fractional months are out of contract — the questionnaire must collect integers.

## 6. Cross-ref semantics (founder ruling Q1)
"Same duty as X" imports **X's charge only** — never X's modifiers. Municipal
transfer duty (DMC Act 1957 s.147) attaches per-instrument as its own modifier, with
its own (base, rate) pair, which can differ from the stamp base on the same
instrument. The engine enforces this structurally.

## 7. Dates and eras
Every rate change is a new version with the notification's own effective date
(`effective_from` = date of publication where the notification says so). Golden
suites must include boundary cases: the day before, the day itself.

## 8. Sources hierarchy
Official dept. pages / gazette / hosted Acts > case law quotes (with citation) >
practitioner reproductions (mark MEDIUM confidence) > commercial websites (never a
sole source — many still recite pre-amendment law, e.g. 0.25% share transfer).
Back up every source document into `sources/<STATE>/` in the same PR.
