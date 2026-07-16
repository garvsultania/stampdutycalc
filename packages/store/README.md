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

Confirmed field values and the `rules_version` hash — permanently. **No verbatim
document snippets**: those follow the uploaded document's lifecycle, so the schema
has no column to put them in. The test suite asserts the absence of such a column,
so re-adding one fails CI rather than quietly changing the retention promise.

## Reproducibility

Every record retains exactly the inputs needed to replay it. The workspace's
Replay button recomputes from those inputs alone and compares the result to what
was recorded, byte-for-byte via the engine's `canonicalJson`. A mismatch is
meaningful rather than a bug: it means the ruleset moved under the record.

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

`migrate()` is idempotent and runs on first request. Without `DATABASE_URL` the
web app degrades to a setup card — the calculator itself needs no database,
because the engine is pure.

The test suite needs no setup: it runs against in-process PGlite (`pnpm test`).
That path is **test-only** — PGlite cannot load inside a bundler's server runtime.
