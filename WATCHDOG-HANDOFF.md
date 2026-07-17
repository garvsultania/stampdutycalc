# StampDraft Watchdog — Handoff

**Updated:** 2026-07-17

**Repository:** `/Users/mac/Documents/Claude Workspace/Projects/stampdutycalc`

**Current branch:** `watchdog/multistate-foundation`

**Current commit:** `f45db8f` (`feat(watchdog): add bounded official source probes`)

Read this together with [`WATCHDOG-PRD.md`](./WATCHDOG-PRD.md). The older [`HANDOFF.md`](./HANDOFF.md) remains authoritative for calculator/rules work; this document is the current state of the Watchdog only.

---

## 1. Git state and publishing

The Watchdog work is local and deliberately **not pushed**. GitHub authentication was unavailable, and the founder asked to push only after the work is ready.

Commit stack, oldest to newest:

1. `57bbd54` — `feat(watchdog): archive and verify MH e-Gazette sweeps`
2. `e491560` — `feat(watchdog): add official multi-state source foundation`
3. `4a85217` — `feat(watchdog): add direct state source adapters`
4. `f45db8f` — `feat(watchdog): add bounded official source probes`

Branches:

- `watchdog/mh-egazette` points to `57bbd54`.
- `watchdog/multistate-foundation` contains all four commits and is the branch to resume.
- Neither branch has an upstream remote yet.

When the founder is ready to publish:

```bash
git switch watchdog/multistate-foundation
git push --set-upstream origin watchdog/multistate-foundation
```

Do not push or merge without a final review. `main` is not the integration base for this work; the stack was created from `m3-frontend` via the dedicated Watchdog branch.

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

### Maharashtra Part 8 — accepted

Source ID: `mh-egazette-part8` (legacy evidence records retain `mh-egazette` for compatibility).

Direct official sweep:

- Range: `2025-04-09` through `2026-07-16`
- 195 unique rows
- 2/2 pages fetched
- 195 content-addressed PDFs locally present and hash-verified
- Canonical sanitized replay: 3 HTML responses + 195 PDF sidecars
- Required sentinels present:
  - Maharashtra Act LXIII of 2025
  - Maharashtra Act XIII of 2026
  - Maharashtra Act XVI of 2026
  - Maharashtra Act XXIX of 2026

The local PDFs are ignored; the index, sweep/event state, sanitized sidecars, and three replay HTML pages are committed.

### Shared architecture — complete

Implemented under `packages/watchdog/src/`:

- generic source IDs and source-aware evidence store
- first-party source registry and hostname enforcement
- generic adapter and sweep contracts
- ASP.NET postback table parser
- static index and issue traversal parsers
- search-form control inspection
- OCR language/status model (recording policy only; OCR execution is not yet built)
- bounded source probes
- Tamil Nadu year-level discovery
- retry/backoff, cookie handling, response recording, header sanitization
- content-addressed immutable archive and append-only JSONL state

CLI:

```bash
pnpm watchdog sources
pnpm watchdog probe SOURCE --live
pnpm watchdog sweep mh-egazette-part8 --from YYYY-MM-DD --to YYYY-MM-DD --live [--record] [--limit N]
```

Only the accepted Maharashtra Part 8 source can run a generic live sweep. Other sources are intentionally probe-only until their full adapter/acquisition gates pass.

---

## 4. Current source status

| Source ID | Status | Direct evidence currently proven | What is still missing |
|---|---|---|---|
| `mh-egazette-part8` | **accepted** | 195/195 archived; full successful sweep and replay | Scheduling/push only |
| `mh-egazette-part4b` | provisional | Five-year discovery: **2,573 rows / 26 pages**; known 2026-01-09 Mudrank sentinel PDF hash-archived | Acquire all 2,573 PDFs, run identical second sweep, then promote |
| `gj-egazette` | provisional | Current official page probe: **22 rows**, **11 advertised pages**; ordinary and extraordinary direct handlers proven | Implement search form/year traversal, five-year discovery and acquisition |
| `ka-dpal-acts` | provisional | Official 2025 probe: **77 identifiable Acts**, **125 direct PDFs** | Prove exact annual URLs for 2021–2026, run known Act checklist, acquire PDFs |
| `tn-gazette-ordinary` | provisional | Official 2026 probe: **28 issue-detail pages**; year→issue→PDF traversal implemented | Run five-year discovery and acquisition |
| `tn-gazette-extraordinary` | provisional | Official 2026 probe: **308 direct PDF rows**; year→PDF traversal implemented | Run five-year discovery and acquisition |
| `dl-revenue-notifications` | provisional | Official listing probe: **10 PDFs / 2 listing URLs** | Traverse both pages/history, establish five-year completeness, execute recorded OCR where needed |
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

Current local footprint is approximately **334 MB**. The large content is ignored evidence/recordings, not staged source code.

The only current per-source acquired evidence is Maharashtra Part IV-B:

- one bounded-probe document
- the known `Mudrank-2024/C.R.182/Mudrank-2` sentinel
- sentinel SHA-256: `1d2695a0be9714d2cc94e9218e9ce4fdff28a12e0968fae0dda9aad4e835d07f`

The Part IV-B sweep is intentionally recorded as `partial`: one document fetched from 2,573 listed rows.

---

## 6. Verification state

Last full gate on 2026-07-17:

- TypeScript project build: passed
- rule validation: **0 errors, 0 warnings**
- golden suite: **166/166 passed**
- Vitest: **146/146 passed across 25 files**
- `git diff --check`: passed

`pnpm` is not globally available in the current shell, but dependencies and local binaries exist. Exact equivalent:

```bash
cd '/Users/mac/Documents/Claude Workspace/Projects/stampdutycalc'
node_modules/.bin/tsc -b
node_modules/.bin/tsx scripts/validate-rules.ts
node_modules/.bin/tsx scripts/run-golden.ts
node_modules/.bin/vitest run
git diff --check
```

Before any new commit, rerun all five commands from the repository root.

---

## 7. Exact next steps

Resume in this order:

1. **Maharashtra Part IV-B full acquisition**
   - Use the already proven 26-page listing.
   - Resume safely into `watchdog-data/sources/mh-egazette-part4b`.
   - Expect a long, polite run: 2,573 documents at a two-second minimum interval is at least ~86 minutes, excluding retries.
   - Do not lower politeness limits to make it faster.
   - Run a second identical sweep; require zero new blobs/documents before promotion.

2. **Tamil Nadu five-year discovery before bulk download**
   - Run `discoverTamilNaduYear` for 2021–2026 for ordinary and extraordinary sources.
   - Record year-level counts and fixture responses.
   - Verify issue/PDF uniqueness and page completeness.
   - Only then perform bounded acquisition and later full acquisition.

3. **Karnataka annual URL discovery**
   - Determine direct DPAL annual pages for 2021–2024 and 2026 from DPAL itself.
   - Assert the PRD checklist: 26/2021, 11/2022, 12/2022, 31/2022, 03/2023, 04/2024, 23/2024, 30/2025, and 42/2025.
   - Do not infer missing annual URLs from a search engine and commit them without a successful direct fetch.

4. **Gujarat five-year search**
   - Implement the official `GazettesSearch.aspx` form controls for press, ordinary/extraordinary, part, year, and department.
   - Record raw form/results fixtures and ASP.NET pagination.
   - Keep ordinary and extraordinary counts explicit.

5. **Delhi, UP, Telangana**
   - Delhi: traverse notification history and implement recorded OCR execution for scans.
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
   - only then change `status` from `provisional` to `accepted`

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
- Do not push until the founder asks and GitHub authentication is configured.

---

## 9. Resume checklist

```bash
cd '/Users/mac/Documents/Claude Workspace/Projects/stampdutycalc'
git switch watchdog/multistate-foundation
git status --short --branch
git log -4 --oneline
node packages/watchdog/dist/cli.js sources
```

Expected HEAD before subsequent work: `f45db8f` plus the handoff commit made after this document. Expected working tree: clean.
