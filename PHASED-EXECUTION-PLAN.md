# StampDraft Recovery and Phase-by-Phase Execution Plan

**Prepared:** 2026-07-19
**Repository:** `/Users/mac/Documents/workspace/Projects/stampdutycalc`
**Branch:** `watchdog/multistate-foundation`
**HEAD:** `e64a13b` (`docs(watchdog): add current multistate handoff`)

This is the authoritative resume plan for the interrupted work. It reconciles the
calculator handoff, Watchdog handoff, source-coverage matrix, saved terminal output,
current working tree, and fresh verification runs.

## 1. Exact stopping point

The last committed checkpoint is `e64a13b` from 2026-07-17. Work continued for two
days without another commit. The working tree currently contains **60 entries**:

- 48 modified tracked files;
- 12 untracked files;
- no staged files;
- approximately 4,163 tracked-line additions and 194 deletions;
- approximately 1.8 GB of local, ignored Watchdog data.

The unfinished work is three coherent units:

1. **Maharashtra Part IV-B acquisition and identity repair.** A five-year corpus of
   2,575 source rows / 2,547 unique PDFs was acquired. Resumability, occurrence-based
   indexing, stable row identities, request limits, and a recorded identity migration
   were added. Part IV-B was then marked accepted.
2. **Transitive safety gates.** Cross-reference dependencies, modifiers, penalty
   regimes, charging sections, and classification trees were brought under pending
   and founder-verification gates. Known unsafe current paths now refuse.
3. **Watchdog-backed citation evidence.** Citation evidence schemas, catalog loading,
   production evidence gates, a 0/99 coverage report, and CI-oriented validation were
   added. The saved terminal stream disconnected immediately after the first wiring of
   this unit. Later edits completed most of it, but it was never checkpointed.

Fresh assessment on 2026-07-19:

| Gate | Result |
|---|---|
| TypeScript project build | Pass |
| Rule validation | Pass: 0 errors, 0 warnings |
| Golden cases | Pass: 166/166 |
| Vitest | Pass: 28 files, 178 tests |
| Next.js production build | Pass |
| `git diff --check` | Pass |
| Evidence validation | **Fail**: generated report differs only in final newline count |

The repository is therefore **nearly functional but not checkpoint-ready**. The full
gate is red until `EVIDENCE-COVERAGE.md` is regenerated exactly.

Production remains intentionally closed: all legal versions have `verified_on: null`
and the evidence report is **0/99 linked**. A passing draft test suite is not legal
verification.

## 2. Rules for uninterrupted execution

These rules apply to every phase:

- Work sequentially and checkpoint each phase with a focused local commit.
- Do not push, merge, or populate founder-verification fields without the founder.
- Never weaken a refusal or evidence gate to make a test pass.
- If primary material does not settle a legal issue, preserve or add a scoped refusal
  and continue with the rest of the phase.
- Treat government sources as evidence; use secondary sources only to locate or
  challenge first-party material.
- Archive complete source result sets. Keywords are triage, not retention filters.
- Keep `Terminal Saved Output` as an untracked recovery artifact; do not include it in
  a product commit and do not delete or move it without approval.
- Do not begin non-MVP state acquisition. Gujarat, Tamil Nadu, Telangana, and Uttar
  Pradesh adapters may remain, but live expansion is parked until the three-state beta.
- Registration-fee depth, Tier 3 analysis, additional states, and a circle-rate database
  remain deferred under the current scope.

Execution should continue without asking for legal conclusions. The only mandatory
human stop is Phase 7, because founder review/merge is the act of verification. An
external credential, durable-storage destination, or repeatedly inaccessible official
source may also require one consolidated blocker report; none should cause unrelated
work to stop.

## 3. Ordered phases

### Phase 0 — Recover, review, and checkpoint the interrupted work

**Goal:** turn the current 60-entry worktree into reviewed, reproducible commits before
new research or encoding begins.

Tasks:

1. Regenerate `EVIDENCE-COVERAGE.md` byte-for-byte, including its final newline.
2. Add `validate:evidence` to the actual GitHub Actions job; it is currently present in
   `package.json` but absent from `.github/workflows/ci.yml`.
3. Review and fix recovery-specific correctness issues:
   - the `/classify` page is statically generated, so its server-derived “today” can
     freeze at build time;
   - application evidence dates need an explicit jurisdiction/time-zone policy instead
     of relying silently on UTC `toISOString()`;
   - the identity-migration record contains an ephemeral local backup path; replace
     that audit field with durable hashes/counts or another reproducible reference;
   - evidence interval validation currently expects one sweep to cover a whole chain;
     support a gap-free union of successful sweeps before annual source runs are linked;
   - catalog validation must account for identity migrations and must not treat a
     hardcoded `accepted` label as sufficient proof of promotion.
4. Reconcile conflicting documentation: current HEAD, dates, Part 8 second-run status,
   Part IV-B promotion basis, current test totals, and the fact that production coverage
   is 0/99.
5. Split the work into reviewable commits, in this order:
   - Part IV-B archive/resume/stable-identity implementation and evidence state;
   - transitive engine/refusal/verification safety unit;
   - citation-evidence schema, catalog, runtime gate, report, and CI gate;
   - coverage matrix, decisions, and handoff updates.

Exit criteria:

- full local gate passes: typecheck, rule validation, evidence validation, goldens,
  Vitest, diff check, and web production build;
- every new source/data claim has a regression or promotion check;
- working tree is clean except explicitly retained local/ignored evidence and the saved
  terminal recovery artifact;
- no push or merge has occurred.

### Phase 1 — Finish the fail-closed safety audit

**Goal:** ensure every amount-affecting uncertainty is machine-enforced, not merely prose.

Current audit signal: among 79 rule/modifier versions, 23 carry machine-readable pending
flags, while a keyword scan finds 28 additional prose-only candidates. The candidates
need legal-impact triage; the count is not itself proof that all 28 require flags.

Tasks:

1. Review every `PENDING`, `assumption`, `confirm`, and `unverified` note in rules,
   modifiers, charging rules, penalties, and classification trees.
2. For each issue that can change article, base, rate, cap, surcharge, concession,
   effective date, or payer liability, add a date/fact/branch-scoped refusal or remove
   the unsupported path from the callable corpus.
3. Prioritize Delhi joint and transfer-duty cells, mortgage base/scope, agreement-to-sell
   threshold, partnership low-capital clause, LLP classification, Maharashtra surcharge
   scope, and Karnataka gift/local-surcharge scope.
4. Add present-day, amendment-boundary, missing-fact, special-clause, and neighbouring
   refusal cases. Historical green cases must not substitute for current-date cases.
5. Add a deterministic safety inventory so new prose-only amount doubts cannot enter
   unnoticed.

Exit criteria:

- every amount-affecting open issue is linked to a refusal test or explicitly excluded;
- no current known-wrong path emits a number;
- validation, goldens, and tests remain green;
- the source-coverage matrix matches executable behavior.

### Phase 2 — Make Watchdog promotion and preservation trustworthy

**Goal:** make source acceptance a generated, reproducible result rather than a manual
status edit.

Tasks:

1. Complete local hardening: validated zero-row success, streaming response-size limits,
   redirect allowlist checks, resumable checkpoints, occurrence history, interruption
   tests, and secret-safe recorded fixtures.
2. Generate a promotion report per source covering range, pages, rows, unique occurrences,
   unique blobs, sentinel documents, second-run additions, failures, and replay results.
3. Derive `accepted` status from that report in validation; do not trust `sources.ts`
   alone.
4. Verify Part 8 with the required second complete identical run. Re-evaluate Part IV-B
   against the same generated gate after the identity migration.
5. Produce checksum manifests and restore-verification tooling for all blobs. Implement
   a provider-neutral durable-storage interface. Keep production closed until an actual
   off-device destination is configured and a restore succeeds.
6. Ensure a fresh clone can validate indexes and fixtures while reporting unavailable
   local blob bodies honestly.

Exit criteria:

- accepted sources pass a machine-generated promotion report;
- a failed, partial, drifted, stale, or unexplained zero-row sweep cannot establish
  freshness;
- identical replay/re-fetch adds zero occurrences and zero blobs;
- a checksum manifest exists and restore verification is executable;
- durable off-device storage remains an explicit release blocker until configured.

### Phase 3 — Complete Maharashtra’s MVP source graph and repair its rules

**Goal:** use the strongest existing source base to create the first review-ready state.

Tasks:

1. Extend Part 8 and Part IV-B coverage back to the 2015 product floor using stable
   identities and polite resumable sweeps.
2. Establish a current Act/Schedule spine and complete amendment/commencement chains.
3. Add municipal/transport surcharge, city coverage, s.149A/s.149B stacking, LBT,
   concession, and relevant IGR source families.
4. Extract and pinpoint relevant instruments from the complete archive; do not attach a
   later or unrelated document merely because it mentions stamp duty.
5. Re-encode known-current failures as append-only eras: Articles 4, 47, 54, and 63,
   the works/service tree, and any transitive dependencies they affect.
6. Resolve or refuse metro-cess, mortgage, gift, women-concession, and locality branches.
7. Add immutable evidence links, current/boundary/negative goldens, and an instrument-sized
   founder-review packet for each repaired dependency group.

Exit criteria:

- Maharashtra source chains cover every review-ready active dependency through the
  chosen evidence date;
- known stale/wrong rules are repaired or remain hard refusals;
- evidence coverage increases only through exact, catalog-valid links;
- no verification metadata is populated before founder review.

### Phase 4 — Re-source Karnataka and rebuild the current eras

**Goal:** replace the five-year-stale source spine and remove the largest known error set.

Tasks:

1. Discover and archive DPAL annual material for 2021–2026.
2. Assert the known checklist: Acts 26/2021, 11/2022, 12/2022, 31/2022, 03/2023,
   04/2024, 23/2024, 30/2025, and 42/2025.
3. Locate and archive commencement notifications, especially for Acts 30/2025 and
   42/2025. Absence from an incomplete source must not imply non-commencement.
4. Add IGR and municipal/local-body source families for practice, surcharge, and scope.
5. Re-encode the missing Article 20 first-sale band and all applicable Act 04/2024
   changes, followed by later Acts and commencement effects.
6. Repair the penalty-route output contract and all affected POA, mortgage,
   hypothecation, affidavit, bond, partnership, LLP, works/service, and share-transfer
   paths.
7. Link exact evidence and add present-day/boundary/refusal goldens.

Exit criteria:

- the annual Act checklist and commencement graph are complete or affected paths refuse;
- no current Karnataka calculation depends on silence from the 2020 consolidation;
- local surcharge and family-gift cess are sourced or scoped out;
- review packets and all automated gates pass.

### Phase 5 — Complete Delhi’s source graph and narrow its supported paths

**Goal:** replace reproductions and assumptions with a current, first-party Delhi chain.

Tasks:

1. Acquire a current Schedule I-A or reconstruct it from official Delhi Gazette
   amendments with a complete history.
2. Traverse and archive the full Delhi Revenue notification history, including OCR
   records for scans.
3. Add the municipal source family for DMC/MCD s.147 and the 10-Jul-2023 transfer-duty
   notification.
4. Add recorded DORIS reconciliation canaries; treat them as anomaly signals, not law.
5. Establish source-backed scope for sale, gift, mortgage with possession, contract for
   transfer, perpetual lease, gender/joint treatment, base, threshold, and effective date.
6. Repair or refuse the low-capital partnership cell, LLP classification, lease/licence,
   POA forks, agreement-to-sell possession fork, works/service residuals, s.4, and penalty.
7. Link evidence and add present-day/boundary/negative goldens.

Exit criteria:

- every supported Delhi result has a complete first-party chain;
- reproduction-only or registrar-practice assumptions remain refused;
- DORIS divergences are visible and unexplained divergences block the affected path;
- review packets and all automated gates pass.

### Phase 6 — Close cross-state dependencies and produce release candidates

**Goal:** finish dependencies shared across state rules and make evidence coverage useful
at the actual computation-graph level.

Tasks:

1. Archive and link the central Stamp Act/securities chain: Finance Act 2019,
   commencement/rate notifications, and official guidance needed for physical share
   transfers.
2. Complete evidence for charging sections, penalty regimes, classification trees, and
   all actually applied modifiers—not only top-level Schedule rules.
3. Keep case-law monitoring separate from Gazette completeness; add pinpoint authorities
   only where licensing and first-party/public access permit.
4. Generate dependency-bounded release candidates. Each candidate must show its complete
   transitive rule graph, evidence hashes, checked intervals, current tests, refusal
   neighbours, and canary status.
5. Update `EVIDENCE-COVERAGE.md` and the source matrix deterministically after every batch.

Exit criteria:

- no release candidate contains a missing or invalid transitive evidence link;
- evidence intervals are current through the chosen release date;
- unsupported dependencies remain explicit coverage gaps, not silent fallbacks;
- full gate and production build pass from a clean checkout.

### Phase 7 — Founder verification and merge gate

**Goal:** perform the one human action the system must not automate.

Tasks:

1. Present one instrument-sized, dependency-bounded review batch at a time.
2. Include primary documents, hashes, pinpoint locators, amendment/commencement chain,
   encoded diff, present-day and boundary goldens, negative cases, and open refusals.
3. Founder either approves/merges, requests a correction, or leaves the path refused.
4. Populate `verified_by` / `verified_on` only as part of the approved merge workflow.
5. Re-run the complete production-mode dependency and evidence gates after every merge.

Exit criteria:

- approved paths have founder verification and valid current evidence;
- rejected/unresolved paths still refuse;
- production answers are enabled only for approved dependency-complete paths.

### Phase 8 — Independent validation and three-state beta readiness

**Goal:** test conditional correctness independently of the encoding workflow.

Tasks:

1. Spot-check high-value property, mortgage, lease/licence, works/service, and penalty
   matters against primary text and fixed official-portal canaries.
2. Investigate every divergence without changing rules merely to match a portal.
3. Exercise real Postgres workspace flows end to end: save, replay, verify, append-only
   audit protection, and setup failure behavior.
4. Test production refusal UX so a blocked path gives a clear, actionable explanation
   rather than a generic server failure.
5. Verify memo rendering, audit reproducibility, privacy/retention behavior, accessibility,
   and deployment configuration.
6. Measure answer coverage separately from conditional correctness.

Exit criteria:

- no unexplained canary divergence on supported paths;
- production-mode end-to-end scenarios pass;
- refusals are counted as coverage gaps, not wrong answers;
- beta release checklist and rollback procedure are complete.

### Phase 9 — Finish in-scope M4/M5 product work

**Goal:** complete the commissioned Phase 2 surface after the legal core is safe.

Tasks:

1. Build Tier 2 PDF/DOCX upload and extraction for only the required computation fields.
2. Require user confirmation/editing before any extracted value reaches the engine;
   preserve source snippets only for the document-retention lifecycle.
3. Add the founder-supplied, anonymized extraction evaluation set and meet the PRD’s
   precision gate on high-risk fields.
4. Add real authentication/firm isolation, real PDF memo export, production Postgres
   migrations/backups, and operational monitoring.
5. Schedule Watchdog only on a network proven to work with the government portals;
   automated runs create review artifacts, never rule changes.
6. Run a small three-state closed beta and measure coverage, escalations, memo exports,
   edit rates, and unexplained divergences.

Exit criteria:

- M4/M5 acceptance tests pass;
- privacy, retention, authentication, backup, and restore behavior are verified;
- beta metrics distinguish refusals from incorrect answers;
- Phase 3+ expansion remains parked pending beta evidence and a new brief.

## 4. Final completion definition

The current engagement is complete only when:

1. the interrupted work is safely checkpointed and all repository gates are green;
2. supported Delhi, Maharashtra, and Karnataka paths are founder-verified and linked to
   current immutable evidence across their complete dependency graphs;
3. unsupported paths fail closed with tested explanations;
4. evidence is durably preserved and restorable;
5. production web/workspace/memo flows pass end to end;
6. Tier 2 confirmation and Watchdog review workflows satisfy the current Phase 2 scope;
7. a closed beta can measure answer coverage without sacrificing conditional correctness.
