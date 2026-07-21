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

### D15 — Tier 2 confirmation is a one-way privacy boundary [M4, updated 2026-07-22]

Provider output is bound to the selected rule's shared input contract: every expected
field must be returned exactly once as either `found` with a page/snippet or explicitly
`not_found`. PDF/DOCX intake requires processing consent, permits only 30-day retention
or compute-and-delete, and enforces the 60-page cap. A separate confirmation object must
disposition every field; required fields cannot remain empty, and an `accepted` value
must exactly match the displayed proposal. The conversion into engine inputs returns
only confirmed values/facts plus the extraction model version. It cannot return source
snippets, so audit callers have no accidental path to persist them. The provider-neutral
lifecycle, routes, confirmation UI, compute/audit consumer, expiry hook, and precision
harness implement this boundary. Production storage/OCR/model configuration remains an
external deployment requirement. Files: `packages/schema/src/extraction.ts` and
`apps/web/lib/tier2-lifecycle.ts`.

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

### D14 — Karnataka from its own statute; two per-state relative lists proven [M2]
KSA 1957 encoded from the official DPAL Act PDF. Conveyance 5% + the s.3B 10%-of-duty
infrastructure cess (primary text) + first-sale flat concession (2%/3%). A bare rate
rule (`KA-ART20-rate`) is the rebaseable cross-ref target for gift/lease(vi)/exchange —
mirroring Delhi's stamp-only pattern (a `select`/`switch` target cannot be rebased, so
the plain-rate indirection is required). KA gift (Art 28) is area-based FIXED amounts
(Rs 5,000/3,000/1,000) with KA's own family list (incl. daughter-in-law, grand children)
— deliberately different from MH's 3%/Rs 200 list, demonstrating why §5.5 forbids a
generalized "family" list. Penalty (s.34/s.39) is discretionary up-to-10× → range.
Local surcharge + perpetuity-lease cess deferred (PENDING). Files: `rules/KA/*`, `sources/KA/*`.

### D14 — Audit fixes: no silent defaults; hash covers penalties [M2, 2026-07-16]
A senior-engineer audit found four mechanical defects, now fixed and regression-tested:

1. **`rules_version` hash excluded penalty regimes** — a Flow D output depends on the
   regime, so an unchanged hash with changed output broke the §7 reproducibility
   guarantee (and the liability shield). `hashSnapshot` now hashes active penalty
   regimes alongside rules and modifiers; `Snapshot` carries `penaltyRegimesById`.
2. **A missing categorical fact silently picked `default`** — demonstrated: an MH
   gram-panchayat mortgage without `area_type` charged 5% (₹5,00,000) instead of 4%
   (₹4,00,000). That is the silent approximation PRD §15 forbids. `RateSpec.default`
   and `select.default` are now OPTIONAL: supply a default ONLY where the statute has a
   genuine residual case (Delhi `transferee_category` → general rate); omit it where
   every case is enumerated (MH `area_type`, KA `ka_area`), so an unmatched/missing fact
   throws `EngineError`. MH conveyance and the KA surcharge were re-encoded accordingly.
3. **Classification-tree terminals were never validated** — a typo'd `rule_id` would
   only fail at runtime, in front of a user. `validateRuleSet(ruleSet, trees)` now checks
   every terminal resolves within the tree's own snapshot; CI passes `load.trees`.
4. **Concessions rendered as surcharge lines** — the breakup `kind` derived from the
   effect *op*, so MH's women concession (a negative `pct_add`) showed as
   `surcharge_cess`. It now derives from `modifier.kind` (wrong in the M3 PDF memo
   otherwise). Also added: validator flags `cap < min_duty`.

Files: `packages/engine/src/{snapshot,charge,modifiers,validators}.ts`,
`packages/schema/src/charge.ts`, `scripts/validate-rules.ts`.

### D13 — `select` charge: categorical sub-charge selection [M2]
Maharashtra gift (Art 34) selects between different charge KINDS by relation — Rs 200
flat (close family, residential/agri), 3% ad valorem (family), or full conveyance rate
(else). The numeric `switch` couldn't express this, so `select` (the categorical analog,
keyed on a fact) was added. Also serves MOA (accompanied-by-AoA) and future POA forks.
Deterministic, no eval. Files: `packages/schema/src/charge.ts`, `packages/engine/src/{charge,validators}.ts`.

### D12 — MH modelled from its own statute; caps and area-rates are first-class [M2]
Maharashtra Stamp Act 1958 is encoded from the official IGR Schedule I as a distinct Act
(the `act` field is load-bearing). Area-based conveyance (RateSpec by `area_type`),
term-% leases (switch → cross_ref conveyance on a fraction of market value), the 0.25%
Leave & License formula (Art 36A), and the Rs 50 lakh MOA cap all fall out of existing
primitives. Metro cess / LBT surcharges and the s.34 penalty cap are deferred
(PENDING_VERIFICATION) rather than guessed — MH conveyance/lease totals are stamp-duty-only
until the surcharge notifications are sourced.

### D10 — Transfer duty as an independent modifier layer (founder ruling Q1) [M1]
Delhi municipal transfer duty (DMC Act 1957 s.147) is NOT part of Sch I-A Art 23: it
attaches only to the s.147 instrument list, sometimes on a DIFFERENT base than the
stamp duty on the same instrument (contract-for-transfer: 90% of consideration).
Encoded as versioned `surcharge_cess` modifiers attached per-rule. The engine's
cross_ref semantics (target's charge only, never its modifiers) make "same duty as a
Conveyance" import the 3%/2% Schedule rate with no transfer duty — exactly the
founder-ruled behaviour, with no special-casing. Files: `rules/DL/modifiers/transfer-duty.json`.

### D11 — Encoding guardrails codified (founder meta-ruling) [M1]
After the Art 46 column-slip incident: two-column PDF extractions must quote both
columns raw; economically absurd rates auto-escalate (PENDING_VERIFICATION stubs);
deliberate escalate-by-error boundaries are documented and golden-covered. Full text:
`ENCODING-GUIDELINES.md`.

### D9 — Engine extensions for Delhi encoding (M1)
Four data-driven, deterministic additions required by the Q1–Q6 rulings:
(1) `switch` charge — banded SUB-CHARGES (Delhi lease: the term band changes WHICH
    cross-ref applies, Bond 15 vs Conveyance, not just a multiplier); no matching
    case throws (escalate-by-error).
(2) `cross_ref.scale` — "ninety per cent of the duty as a Conveyance" (Art 23A)
    scales the TARGET'S DUTY, not its base.
(3) `Effect.pct_add`: `of` is now "duty" | ValueExpr (surcharge base may differ from
    stamp base), and `pct` may be a RateSpec (transfer duty 4%/3% by category).
(4) `Condition.cmp` — numeric threshold over a ValueExpr (the ₹25-lakh
    transfer-duty cliff, 10-Jul-2023 notification).
Files: `packages/schema/src/{charge,modifier}.ts`, `packages/engine/src/{charge,condition,modifiers,validators}.ts`.

### D8 — Category-selected ad valorem rate (`RateSpec`) [M1]
Delhi conveyance has three EXACT statutory rates by buyer category (6% male / 4%
female / 5% joint). Modelling female/joint as a percentage-off concession is
non-exact (6% × ⅔ ≠ a clean 4% under fixed-precision arithmetic). So `ad_valorem.pct`
now accepts either a number or a data-driven selector `{ by: <fact>, cases: [{when,
pct}], default }`, resolved against the caller's categorical `facts`. Deterministic,
exact, no eval. Threaded `facts` into `ChargeCtx`. Files: `packages/schema/src/charge.ts`,
`packages/engine/src/charge.ts`, `compute.ts`.

### D7 — M0 has zero DB / UI / LLM
Engine is a pure standalone library + CLI. Postgres enters at M3; UI at M3; there is no
LLM anywhere in the computation path (handoff law #2). Synthetic fixtures live under
`packages/engine/src/__fixtures__/` (jurisdiction tag `DL`) and are kept separate from
the real `rules/DL` corpus, which stays empty until M1.

## D15 — Pending verification is machine-readable, and refuses by default

`notes_for_reviewer` is prose: a human reads it in a PR, the engine cannot. A cell
the encoder had explicitly marked untrusted still produced a number wearing the
same confidence as a verified one — the project's one unforgivable failure mode,
shipped by construction.

`pending_verification: PendingVerification[]` now sits on Rule and Modifier:
`{ reason, when?, severity? }`. `when` reuses the existing Condition language and
scopes the flag to the doubtful CELL, which is what makes refusal affordable —
Delhi transfer duty is verified for male and female purchasers, so only the
joint-above-₹25L combination refuses while the rest of the state keeps computing.

`severity` defaults to **"refuse"**. Founder delegated this call (16-07-2026); the
reasoning is that a warning is what a hurried lawyer clicks past. `"warn"` is an
explicit opt-down for doubt that does not touch the figure — Delhi share transfer,
where the amount is verified and only WHO pays is contested. Refusing there would
overstate our own doubt.

`ComputeOutput.escalations` was declared and hardcoded to `[]` — a dead field
promising a safety channel that did not exist. Removed. Refusals throw
`EngineError`; `warnings` is now genuinely populated.

## D16 — A missing fact is not a "no"

`Modifier.requires_facts: string[]`. A modifier gated on `applies_when` used to
drop out silently when the fact it depends on was absent — asserting a legal
conclusion ("no metro cess is due on this Mumbai flat") that nobody reached. The
engine now escalates instead.

This was not theoretical: `MH-metro-cess` is gated on `metro_cess_city`, and SIX
Maharashtra goldens asserted totals that silently omitted the 1% cess. Supplying
the fact explicitly left every expected value unchanged — proving the assumption
was real, load-bearing and invisible. Same disease as the `RateSpec.default` fix
(D8), in the applicability gate rather than the rate.

## D17 — A stale primary source outranked a correct secondary (KA post-mortem)

`KA-SOURCING.md` logged a DISCREPANCY: secondary sources claimed a 35–45 lakh
affordable-housing band at 3%; our committed primary PDF had no such band; we
resolved in favour of the primary, per the §8 hierarchy.

**The secondaries were right.** Act 26 of 2021 inserted Art 20(2A)(iii) on
05-10-2021. Our primary — `sources/KA/karnataka-stamp-act-1957_dpal-karnataka.pdf`
— is a stale print whose newest amendment footnote is Act 55 of 2020. The
hierarchy worked exactly as written and produced a two-percentage-point overcharge
on the most common retail transaction in Karnataka, held with high confidence,
for nearly five years.

The §8 hierarchy ranks sources by AUTHORITY. It has no axis for CURRENCY, and
authority without currency is just a confident antique. Amendment: a primary
source must carry the date it was last consolidated to, and that date is part of
the citation. When a secondary asserts something our primary lacks, the question
is not "which source ranks higher" but "is our primary current enough to be
silent about this?" A primary that predates the claimed amendment cannot refute it.

## D18 — Safety gates follow the complete computation dependency graph

A computation is not supported merely because its top-level rule is supported.
Every `cross_ref` target contributes law to the number and is therefore a
load-bearing dependency for pending-verification, founder-verification,
`verified_as_of`, and citations.

This closes a concrete defect: `KA-ART29-indemnity-bond` imports
`KA-ART47-security-bond`. Article 47 is flagged stale from 03-02-2024, but the
indemnity rule had no local flag, so the old Article 47 amount still escaped.
Charge evaluation now records every traversed rule; pending flags propagate over
that set, and the current Karnataka indemnity goldens assert refusal.

`ComputeOptions.requireVerified` is the explicit production gate. When enabled,
every traversed rule, applied modifier, and requested penalty regime must carry
paired `verified_by`/`verified_on` metadata. Draft encoding and golden tooling keep
the option off so unmerged work remains testable. Web compute, filing, and memo
paths enable it when `NODE_ENV=production`. `verified_as_of` is now the oldest
verification date across dependencies, and cross-reference source citations are
included in the output.

## D19 — Every legal decision path carries the same refusal contract

Pending verification and founder verification now apply beyond Schedule-rate
rules. `PenaltyRegime` and `ClassificationTree` carry machine-readable
`pending_verification`; charging rules carry it separately on s.4, s.5, and s.6
so doubt about one section does not disable the others.

This converts three known amount-affecting prose caveats into hard stops: Delhi
s.4's unconfirmed Rs 1 ancillary duty, Delhi's unconfirmed penalty range, and
Karnataka's conflated discretionary-Collector versus mandatory-admission penalty
paths. The Maharashtra works/service tree also refuses from 14-10-2024 because
its quoted Article 63 consequence is stale. Delhi classification flags are
branch-scoped: the supported questions can still be walked, but the unproved
leave/licence and works/service terminal treatments cannot resolve.

Charging analyses now resolve and cite the operative s.5/s.6 rules, reject mixed
jurisdictions and execution dates, and propagate verified-only mode into every
underlying instrument computation. The production classification API requires
tree verification, resolves the tree version active on the instrument date, and
carries that date into scoped flags. These are dependency gates only: no disputed
rate was silently corrected.

## D20 — Evidence is an immutable, freshness-bounded dependency

A quoted citation is review context, not proof that the operative text is current.
`Citation.evidence` therefore records exact Watchdog document hashes, source-row
identities, acquisition runs, publication dates, pinpoint locators, document roles,
amendment and commencement chains, complete-sweep audits, and human evidence review.
Each chain names every required source family and its checked interval; an empty
document list is meaningful only when a named source has a successful sweep covering
that interval.

Evidence remains optional in draft data so encoding, goldens, and historical repair
can proceed. `requireEvidence` makes it mandatory on every dependency used by
compute, charging, and classification paths. The caller must also supply
`evidenceAsOf`; the engine refuses a chain checked before that date and never reads
the wall clock itself. Production web paths pass the current date explicitly.

CI loads every committed Watchdog index, sweep, and event shard and validates each
supplied link against the exact immutable records and an accepted source. The
Maharashtra Part 8 source declares `mh-egazette` as its legacy evidence ID so old
records remain verifiable without rewriting history. Missing links are coverage
gaps; malformed, provisional, partial-sweep, or mismatched links fail validation.

The deterministic evidence report currently records **0 of 115** citation
dependencies linked. Thirteen Maharashtra dependencies have exact, mechanically valid
proposal packets, but remain unlinked pending human review. This is deliberate: the
accepted archive contains only part of the primary-source graph the numeric corpus
cites. No unrelated document is attached merely to improve a coverage count.

## D21 — Portal position is not source identity

Maharashtra Part IV-B returned the same 2,575 PDFs on an identical full re-fetch,
but reordered 179 rows. The original identity included the displayed serial number
and ASP.NET postback control position, so unchanged documents were falsely emitted
as new source occurrences. Content deduplication caught the symptom (`0` new blobs),
but an audit that says `179` new documents for unchanged content is not acceptable.

Part IV-B row identity is now the normalized visible row metadata plus an ordinal
only for genuinely identical visible rows. Dynamic serial numbers and postback
positions remain retrieval locators, not identity. A recorded migration collapsed
the positional aliases back to the complete 2,575-row baseline; no content blob was
deleted. A subsequent live sweep reused all 2,575 stable identities with zero
additions.

The migration audit retains the baseline run, before/after occurrence counts,
strategy, and post-migration index digest. Its temporary pre-migration rollback
copy was not retained, so the record says that explicitly instead of preserving a
machine-local path that no future reviewer could use. Future migrations record both
pre- and post-migration digests at execution time.

Transient `__VIEWSTATE` and related ASP.NET session fields are also excluded from
the immutable document index. They are neither stable nor replayable evidence and
had inflated the Part IV-B locator index to 269 MB. The compact index retains the
official URL, search selection, date range, and postback target; raw sessions belong
in optional recordings, not citation provenance.

## D22 — Authentication asserts identity; the store proves firm membership

Protected routes have no header-derived or demo-principal fallback. A deployment adapter
must authenticate its own session/token and return a stable issuer, subject, and asserted
firm. The store then resolves that exact identity inside the firm before any route work.
Repository checks and composite foreign keys independently reject non-members and
cross-firm matter/computation/extraction relationships. With no adapter installed the
application returns 401 and readiness remains red; provider selection is deliberately
outside the product core.

## D23 — Database evolution and recovery are forward-only and content-addressed

Store migrations are contiguous immutable versions recorded with SHA-256 checksums and
applied transactionally. Drift, gaps, future schemas, and partial application fail closed.
Backups use a repeatable-read snapshot and canonical manifest whose object key and data
payload are independently hashed; restore requires an empty destination, runs under an
exclusive transaction, and re-verifies the restored data while retaining append-only
triggers. In-memory storage exists only for tests. Production readiness requires an
installed encrypted off-device provider and a real Postgres backup/restore drill.
