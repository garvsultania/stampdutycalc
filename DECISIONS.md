# DECISIONS

Deviations from `stampdraft-prd.md` and load-bearing engineering decisions, with
rationale. Governing amendments from the handoff prompt are recorded first because
they override the PRD where they conflict.

## Governing amendments (from the founder handoff)

- **A1 — Audit retention.** The audit log permanently retains only confirmed field
  values and the `rules_version` hash. Verbatim document snippets follow the
  uploaded document's retention lifecycle (deleted with the document). Reproducibility
  is preserved via {confirmed values + hash}. Supersedes the ambiguity in PRD §7.
- **A2 — No review-queue UI.** Verification is PR-based: every rule/tree is a data
  file; the founder (sole verifier) merges = verification; `verified_by`/`verified_on`
  populate on merge. CI blocks merge if a state golden suite fails or any active rule
  lacks a citation. Replaces PRD §6.3(4).
- **A3 — Scope.** Execute Phases 0–2 / milestones M0–M5. Phase 3+ not built.

## Engineering decisions (M0)

### D1 — Unified recursive `Charge` model (approved by founder)
PRD §6.1's JSON separates `base` and `rate`; it is explicitly labelled "illustrative".
We collapse them into a single recursive `Charge` discriminated union
(`fixed | ad_valorem | slab | formula | cross_ref`). One shape provably covers every
case in PRD §5.1–5.3, including the canonical lease (rent-multiple `ad_valorem` +
premium-as-conveyance via a `cross_ref`), with `min_duty`/`cap` clamping any node.
Rationale: fewer moving parts, no base/rate coordination bugs, cleaner formula nesting.
File: `packages/schema/src/charge.ts`.

### D2 — Exact decimal arithmetic, no floats
All money/value math flows through a configured `decimal.js` (40 sig-fig precision),
normalised to a canonical fixed-point string (≤4 dp) on output. Guarantees the
byte-for-byte reproducibility PRD §7 requires. No IEEE float ever touches a computation.
File: `packages/engine/src/money.ts`.

### D3 — `ValueExpr` is a data AST, never `eval`
"Arbitrary arithmetic over named inputs" (PRD §5.1) is modelled as a small JSON AST
(`var | lit | op | fn(max/min) | band`) walked by the engine. No string DSL, no
`eval` — keeps the computation path deterministic and injection-free.
File: `packages/schema/src/value-expr.ts`.

### D4 — Penalty month-count is an input, not a clock read
Per-month penalty regimes take the elapsed month count as an explicit argument so the
engine stays pure and reproducible (a clock read would break determinism). Discretionary
regimes always emit a range, never a point estimate (PRD §5.6).
File: `packages/engine/src/penalty.ts`.

### D5 — `cross_ref` re-base is restricted to `ad_valorem`/`slab` targets
`cross_ref.on` ("same duty as Conveyance, computed on `premium`") re-bases only targets
whose base is a single value expression. Re-basing a `formula`/`fixed` target is
ambiguous and throws `EngineError` rather than guessing (PRD §15: no silent approximation).
File: `packages/engine/src/charge.ts`.

### D6 — No wall-clock timestamp inside the engine
`compute()` does not stamp a timestamp; that would make output non-reproducible. The
audit layer (M3) records the timestamp alongside the deterministic output.

### D7 — M0 has zero DB / UI / LLM
Engine is a pure standalone library + CLI. Postgres enters at M3; UI at M3; there is no
LLM anywhere in the computation path (handoff law #2). Synthetic fixtures live under
`packages/engine/src/__fixtures__/` (jurisdiction tag `DL`) and are kept separate from
the real `rules/DL` corpus, which stays empty until M1.
