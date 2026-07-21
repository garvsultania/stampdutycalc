# @stampdraft/store

Firm workspace persistence: firms, users, matters, API keys, and the **append-only
computation audit log** (PRD §7).

## The audit log is append-only in the database, not in the application

`computation_audit` carries `BEFORE UPDATE OR DELETE` triggers that raise an
exception. Immutability does not depend on application code being careful, or on
an ORM being configured correctly — a `psql` session with full table privileges
cannot rewrite history either. A correction is a new record, never an edit.

`packages/store/src/store.test.ts` proves this: it issues a real `UPDATE` and a
real `DELETE` against a real Postgres and asserts both are refused.

## What is retained (Amendment A1)

Confirmed field values, the `rules_version` hash, and its canonical legal snapshot —
permanently. **No verbatim document snippets**: those follow the uploaded document's
lifecycle, so the schema has no column to put them in. The test suite asserts the
absence of such a column, so re-adding one fails CI rather than quietly changing the
retention promise.

## Reproducibility

Every record retains exactly the inputs needed to replay it, and every referenced
`rules_version` has an append-only canonical snapshot. The workspace's Replay
button validates that archive against its hash, recomputes without consulting live
rules, and compares the result to what was recorded via the engine's `canonicalJson`.

`output` is `json`, not `jsonb`. `jsonb` normalises key order, which would defeat
byte-for-byte comparison.

## Running it

The library and the web app need a real Postgres:

```bash
docker run -d --name stampdraft-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=stampdraft postgres:16

echo 'DATABASE_URL=postgres://postgres:stampdraft@127.0.0.1:5432/postgres' \
  > apps/web/.env.local
```

For production or any non-loopback deployment, also set a random secret of at
least 32 bytes as `STAMPDRAFT_MEMO_CAPABILITY_SECRET`. It signs five-minute,
firm-scoped memo capabilities and must never be exposed to browser code.

`migrate()` applies only the unapplied, contiguous, checksummed forward migrations in
one transaction per version and runs on first request. It refuses checksum drift,
ledger gaps, and a database newer than the application. `Store.checkReadiness()` also
checks every required table and the exact append-only triggers.

`createDatabaseBackup()` exports a repeatable-read snapshot to a canonical,
content-addressed manifest. Production providers must declare encrypted-at-rest and
off-device capabilities. `restoreDatabaseBackup()` accepts only a clean destination,
restores transactionally, recomputes the data hash, and preserves append-only guards.
The included memory provider is test-only; a real provider and production restore drill
are deployment requirements.

Without `DATABASE_URL` the
web app degrades to a setup card — the calculator itself needs no database,
because the engine is pure.

The test suite needs no setup: it runs against in-process PGlite (`pnpm test`).
That path is **test-only** — PGlite cannot load inside a bundler's server runtime.
