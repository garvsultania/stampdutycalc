# StampDraft Watchdog — Handoff

**Updated:** 2026-07-22

**Repository:** `/Users/mac/Documents/workspace/Projects/stampdutycalc`

**Current branch:** `watchdog/multistate-foundation`

**Recovery base:** `22842b4`; use the tip of `watchdog/multistate-foundation` for the
published implementation state.

Read this together with [`WATCHDOG-PRD.md`](./WATCHDOG-PRD.md). The older [`HANDOFF.md`](./HANDOFF.md) remains authoritative for calculator/rules work; this document is the current state of the Watchdog only.

---

## 1. Git state and publishing

The founder authorized publishing the completed engineering work on 2026-07-22. Branch
publication does not merge it and does not populate legal-review or founder-verification
metadata.

Historical pre-recovery stack, oldest to newest:

1. `57bbd54` — `feat(watchdog): archive and verify MH e-Gazette sweeps`
2. `e491560` — `feat(watchdog): add official multi-state source foundation`
3. `4a85217` — `feat(watchdog): add direct state source adapters`
4. `f45db8f` — `feat(watchdog): add bounded official source probes`
5. `e64a13b` — `docs(watchdog): add current multistate handoff`

The recovered batch after that stack is split into reviewable implementation,
evidence-data, product, and documentation commits. Its exact state and gate record are
in [`PHASED-EXECUTION-PLAN.md`](./PHASED-EXECUTION-PLAN.md).

Branches:

- `watchdog/mh-egazette` points to `57bbd54`.
- `watchdog/multistate-foundation` contains the full review series and is the branch to use.

Authorized publication command (idempotent after upstream creation):

```bash
git switch watchdog/multistate-foundation
git push --set-upstream origin watchdog/multistate-foundation
```

Do not merge without final review. `main` is not the integration base for this work; the
stack was created from `m3-frontend` via the dedicated Watchdog branch.

---

## 2. Non-negotiable evidence policy

The Watchdog detects, fetches, and archives **primary evidence**. It never interprets law or writes to `rules/`.

Only first-party government sources may become evidence:

- Each source definition has an official HTTPS base URL and explicit hostname allowlist.
- Any document URL leaving the allowlist fails with `shape_drift`.
- Commercial trackers, legal blogs, mirrors, snippets, and summaries are not evidence.
- Indirect material may help locate an official document, but nothing is archived or claimed until fetched from the allowlisted government source.
- A bounded `probe_ok` is not a successful sweep and never establishes currency or completeness.
- A bounded acquisition is `partial`, never `ok`.
- Telangana GOIR is explicitly a **government-orders source**, not complete Gazette coverage.

---

## 3. What is complete

### Maharashtra Part 8 — generated promotion passes

Source ID: `mh-egazette-part8` (legacy evidence records retain `mh-egazette` for compatibility).

Direct official sweep:

- Range: `2025-04-09` through `2026-07-16`
- 195 unique rows
- 2/2 pages fetched
- 195 content-addressed PDFs locally present and hash-verified
- 2 complete exact-range acquisition/re-fetch runs
- Latest full re-fetch: 195 fetched, 0 reused, 0 new blobs, 0 new occurrences
- Canonical sanitized replay: 3 HTML responses + 195 PDF sidecars
- Required sentinels present:
  - Maharashtra Act LXIII of 2025
  - Maharashtra Act XIII of 2026
  - Maharashtra Act XVI of 2026
  - Maharashtra Act XXIX of 2026
- Complete receipt-bound historical query segments from 2015-01-01 through 2025-04-08
- 1,368 total occurrences / 1,361 unique blobs across the expanded collection

The local PDFs are ignored; the index, sweep/event state, sanitized sidecars, and three replay HTML pages are committed.

The historical bounded/partial run is retained honestly and is recovered by the later
complete audit. No handwritten source status is present: the deterministic promotion
report derives Part 8 acceptance from the two exact runs, counts, sentinel set, and
zero-addition repeat.

### Shared architecture — complete

Implemented under `packages/watchdog/src/`:

- generic source IDs and source-aware evidence store
- first-party source registry and hostname enforcement
- generic adapter and sweep contracts
- ASP.NET postback table parser
- static index and issue traversal parsers
- search-form control inspection
- OCR language/status model (recording policy only; OCR execution is not yet built)
- generated source-promotion reports with exact repeat-run/addition/sentinel gates
- streaming response limits, redirect allowlists, zero-row refusal, and occurrence history
- deterministic blob manifests plus provider-neutral backup/restore verification
- bounded source probes
- Tamil Nadu year-level discovery
- retry/backoff, cookie handling, response recording, header sanitization
- content-addressed immutable archive and append-only JSONL state

CLI:

```bash
pnpm watchdog sources
pnpm watchdog probe SOURCE --live
pnpm watchdog sweep mh-egazette-part8 --from YYYY-MM-DD --to YYYY-MM-DD --live [--resume] [--record] [--limit N] [--skip-row N]
pnpm watchdog sweep mh-egazette-part4b --from YYYY-MM-DD --to YYYY-MM-DD --live [--resume] [--record] [--limit N] [--skip-row N]
pnpm watchdog sweep ka-dpal-acts --from 2021-01-01 --to 2026-MM-DD --live [--resume] [--record] [--limit N] [--skip-row N]
pnpm watchdog sweep dl-revenue-notifications --from YYYY-MM-DD --to SAME-YYYY-MM-DD --live [--resume] [--record] [--limit N] [--skip-row N]
```

The Maharashtra Part 8 and Part IV-B adapters can run live sweeps. Karnataka now has a
fixture-tested six-page checklist and acquisition adapter, but remains provisional until
the live traversal, complete acquisition, and zero-addition repeat succeed. Other sources
remain probe-only until their adapter/acquisition gates pass. Delhi has a snapshot-only
acquisition adapter: identical observation dates prevent the current listing from being
misreported as a complete historical range.

---

## 4. Current source status

| Source ID | Status | Direct evidence currently proven | What is still missing |
|---|---|---|---|
| `mh-egazette-part8` | **generated promotion passes** | 195/195 accepted baseline; two exact complete sweeps; complete query segments from the 2015 floor; 1,368 occurrences / 1,361 blobs total | Review 422 selected occurrences / 421 blobs, including all 407 enacted-law-title backstop items and the two curated generic-title dependency targets, and establish complete amendment/commencement chains |
| `mh-egazette-part4b` | **generated promotion passes** | **2,575 rows / 26 pages** accepted baseline; complete 2015–2020 queries; 207/208 early-2021 rows; 5,065 occurrences / 5,030 blobs total | Retry the exact 2021-05-28 delivery gap; review 107 selected title candidates / 105 blobs and establish complete chains |
| `mh-igr-publications` | provisional | Official first-party portal registered; source-specific discovery supports 8 publication families and fails closed on missing navigation | Run and record discovery; implement per-family pagination/document acquisition; establish dated history and repeatability before promotion |
| `gj-egazette` | provisional | Current official page probe: **22 rows**, **11 advertised pages**; ordinary and extraordinary direct handlers proven | Implement search form/year traversal, five-year discovery and acquisition |
| `ka-dpal-acts` | provisional | Official 2025 probe: **77 identifiable Acts**, **125 direct PDFs**; full 2021–2026 traversal, nine-Act gate, and complete PDF acquisition are fixture-tested and CLI-wired | Run and record the full live sweep; repeat with zero additions; only then evaluate promotion |
| `tn-gazette-ordinary` | provisional | Official 2026 probe: **28 issue-detail pages**; year→issue→PDF traversal implemented | Run five-year discovery and acquisition |
| `tn-gazette-extraordinary` | provisional | Official 2026 probe: **308 direct PDF rows**; year→PDF traversal implemented | Run five-year discovery and acquisition |
| `dl-revenue-notifications` | provisional | Official listing probe: **10 PDFs / 2 listing URLs**; bounded full-pagination probe and snapshot PDF acquisition are fixture-tested and CLI-wired | Run and record the live snapshot acquisition; establish history completeness separately; repeat with zero additions; execute recorded OCR where needed |
| `up-igrsup-orders` | provisional | First-party Acts, Rules, fee schedules, amendments, valuation, and stamp-dispute entry points pinned | Portal is fragmented; implement per-entry traversal, dates/completeness, and OCR evidence |
| `tg-goir-revenue` | provisional | Revenue department option and MS/RT GO types directly verified | Implement result submission/replay and document acquisition; separately locate official Gazette source before claiming Gazette coverage |

No provisional source is represented as a complete five-year sweep.

---

## 5. Evidence/data layout

```text
watchdog-data/
  blobs/                              # local MH Part 8 PDFs; ignored
  index/documents.jsonl               # committed MH Part 8 index
  state/{sweeps,events}.jsonl         # committed MH Part 8 state
  recordings/full-acceptance-20260717/
    0001.json ... 0198.json           # sanitized committed response metadata
    bodies/0001.html ... 0003.html    # committed replay HTML
    bodies/*.pdf                      # local, ignored
  sources/
    <source-id>/
      state/probe.jsonl               # one committed bounded probe result where available
      index/documents.jsonl           # committed acquired-document index where available
      state/{sweeps,events}.jsonl     # committed sweep state where available
      blobs/                           # local content-addressed PDFs; ignored
      recordings/                     # local raw probe/sweep recordings; ignored
      probe/                           # local diagnostic HTML; ignored
```

Current local footprint is approximately **3.3 GB**. The large content is ignored evidence/recordings, not staged source code; the committed Part IV-B locator index is approximately 4.6 MB because transient ASP.NET ViewState is excluded.

Maharashtra Part IV-B now contains a complete five-year dataset that passes the
generated promotion check for its stated interval:

- 2,575 stable source rows and 2,547 unique content-addressed PDFs
- three successful complete 26-page audits for the exact 2021-07-17 through 2026-07-19 interval
- an independent 2,575-document re-fetch with zero new blobs
- a post-migration stability audit with 2,575 reused identities and zero additions
- known `Mudrank-2024/C.R.182/Mudrank-2` sentinel SHA-256: `1d2695a0be9714d2cc94e9218e9ce4fdff28a12e0968fae0dda9aad4e835d07f`

The identity migration is recorded in `state/identity-migrations.jsonl`; it removed positional aliases caused by unstable ASP.NET row numbers/control IDs without deleting any content blob. The durable record includes the post-migration index digest and honestly notes that its temporary pre-migration rollback copy was not retained.

Both accepted Maharashtra collections have committed manifests tied to the exact index
digest: 1,361 Part 8 blobs and 5,030 Part IV-B blobs. All 6,391 local bodies pass path,
size, and SHA-256 verification. A metadata-only clone reports the ignored bodies as
unavailable; a partially present or corrupt body set fails. The provider-neutral restore
path is executable and tested, but no real off-device provider or restore receipt is
configured, so durable storage remains a release blocker.

The historical contracts prove 11 complete Part 8 query segments (1,173 occurrences)
before its accepted baseline. Part IV-B has six complete yearly queries for 2015–2020
and an explicit 207/208 receipt for 2021-01-01 through 2021-07-16. The one unavailable
row is stable ID `473c8cdae40e7c93bb8268ad7614c9ed231e8536fb94445cb676f75fbafcf6ed`,
dated 2021-05-28; retries against the official delivery exhausted their bounded timeout.

`WATCHDOG-MH-EVIDENCE-CANDIDATES.json` deterministically selects 529 occurrences / 526
blobs from the expanded archive: 409 enacted-law titles, 13 bills, 88 notification/order
titles, and 19 other candidates. Part 8 enacted Acts are selected even when their generic
titles lack a stamp keyword. Each candidate carries its local blob path and sorted keyword
pages. `WATCHDOG-MH-CONTENT-EXTRACTION.json` scans only those selected blobs: 491 yielded
text, 35 were empty/image-only, and none failed. Title stages and keyword pages are
triage-only, non-citable review locators and do not establish legal effect or chain completeness.
`WATCHDOG-MH-REVIEW-QUEUE.md` renders the same data as a deterministic 529-item human
checklist and is checked for staleness alongside the JSON report.

---

## 6. Verification state

Latest gate on 2026-07-22:

- TypeScript project build: passed
- rule validation: **0 errors, 0 warnings**
- evidence-link proposals: **13/13 mechanically valid**, all pending human review
- golden suite: **256/256 passed** (**216 eligibility, 40 arithmetic**)
- evidence coverage validation: **0 invalid supplied links**; **0/115 linked**
- Vitest: **367/367 passed across 63 files**
- Next.js production build: passed
- `git diff --check`: passed

`pnpm` is not globally available in the current shell, but dependencies and local binaries exist. Exact equivalent:

```bash
cd '/Users/mac/Documents/workspace/Projects/stampdutycalc'
node_modules/.bin/tsc -b
node --import tsx scripts/validate-rules.ts
node --import tsx scripts/validate-evidence.ts --check-report --verify-blobs
node --import tsx scripts/validate-evidence-proposals.ts --check-report
node --import tsx scripts/run-golden.ts
node_modules/.bin/vitest run
git diff --check
(cd apps/web && node_modules/.bin/next build)
```

Before any new commit, also run evidence validation and the web production build as
listed in `PHASED-EXECUTION-PLAN.md`.

---

## 7. Exact next steps

Resume in this order:

1. **Maharashtra source spine, missing families, and candidate review**
   - Review the receipt-bound candidates for stamp commencements, concessions, surcharge/remission orders, and amendment dependencies.
   - Attach documents only after pinpoint review and a complete baseline/amendment/commencement chain is established.
   - Acquire a current Act/Schedule spine plus IGR and municipal/transport/LBT source families.
   - Retry the exact early-2021 Part IV-B gap without weakening timeout or integrity rules.
   - Preserve the two-second politeness limit and stable visible-row identity strategy.

2. **Tamil Nadu five-year discovery before bulk download**
   - Run `discoverTamilNaduYear` for 2021–2026 for ordinary and extraordinary sources.
   - Record year-level counts and fixture responses.
   - Verify issue/PDF uniqueness and page completeness.
   - Only then perform bounded acquisition and later full acquisition.

3. **Karnataka annual discovery and acquisition**
   - The direct DPAL 2021–2026 traversal, required-Act checklist, CLI full probe, and PDF acquisition sweep are implemented with deterministic fixtures.
   - Run and record `sweep ka-dpal-acts` when official-network access is available; then repeat with `--resume` and require zero additions.
   - Do not promote fixture success or URL construction into a live completeness claim; require successful direct responses and a zero-addition repeat.

4. **Gujarat five-year search**
   - Implement the official `GazettesSearch.aspx` form controls for press, ordinary/extraordinary, part, year, and department.
   - Record raw form/results fixtures and ASP.NET pagination.
   - Keep ordinary and extraordinary counts explicit.

5. **Delhi, UP, Telangana**
   - Delhi: bounded pagination and snapshot acquisition are fixture-tested and CLI-wired; run the dated snapshot live, establish full-history coverage separately, and implement recorded OCR execution for scans.
   - UP: treat Acts/Rules/fees/order collections as separate source families if their shapes differ.
   - Telangana: implement GOIR result submission and document links; never rename this source as a Gazette source.

6. **Promotion gate per source**
   - five-year direct discovery
   - complete document acquisition
   - immutable/hash checks
   - second identical run with zero additions
   - interruption and shape-drift tests
   - known direct sentinel(s)
   - offline replay
   - only then let the generated report derive `accepted` status

---

## 8. Known operational traps

- Do not run live probes without `--live`.
- Do not equate `probe_ok` with sweep success.
- Do not commit PDF bodies to ordinary Git.
- Do not commit session cookies or authorization headers; recorder sanitization and tests enforce this.
- Do not trust HTTP 200 alone: verify media type and PDF signature.
- Do not archive only keyword matches. Archive complete source rows; keywords are triage only.
- Do not use embedded Marathi text as authoritative OCR output.
- Do not claim a negative (“no 2026 Act”) unless the relevant direct sweep completed successfully.
- Do not write any Watchdog result to `rules/`.
- Branch publication is authorized; merge and verification metadata still require the
  founder's separate qualified review.

---

## 9. Resume checklist

```bash
cd '/Users/mac/Documents/workspace/Projects/stampdutycalc'
git switch watchdog/multistate-foundation
git status --short --branch
git log -4 --oneline
node packages/watchdog/dist/cli.js sources
```

Recovery baseline: `22842b4` plus the completed review series described in
`PHASED-EXECUTION-PLAN.md`. Local ignored evidence bodies and `Terminal Saved Output`
are intentionally outside ordinary Git.
