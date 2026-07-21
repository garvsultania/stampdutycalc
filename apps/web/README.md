# StampDraft web application

Next.js interface for deterministic computation, classification, firm-scoped workspace
filing, archived-snapshot replay, and short-lived memo access.

`/document-check` provides the provider-independent Tier 2 flow: consented PDF/DOCX
intake, page-referenced field review, mandatory confirmation, deterministic computation,
audit filing with model version, and lifecycle deletion. It fails closed until a
compliant production extraction provider is installed.

The memo page supports both browser printing and a standalone multi-page PDF generated
from the immutable audit output. HTML and PDF paths share the same five-minute,
firm-scoped capability and require Postgres.

## Local development

From this directory:

```bash
npm run dev
```

The calculator and classification UI work without a database. Workspace filing, replay,
and memo export require Postgres through `DATABASE_URL`; see `packages/store/README.md`.

Local draft execution is disabled by default. To evaluate unverified encodings on a
loopback host, both explicit settings are required:

```bash
STAMPDRAFT_EXECUTION_POLICY=local-draft
STAMPDRAFT_LOCAL_DRAFT_ACK=UNVERIFIED_LOCAL_ONLY
```

Draft mode is rejected in production and on non-loopback requests. Production defaults
to founder-verified, current-evidence execution.

## Production configuration

- `DATABASE_URL`: real Postgres; PGlite is test-only.
- `STAMPDRAFT_MEMO_CAPABILITY_SECRET`: server-only random secret of at least 32 bytes.
- `STAMPDRAFT_OPERATIONS_SECRET`: a separate 32-byte-or-longer secret for the protected
  retention-expiry scheduler hook.
- `STAMPDRAFT_EXECUTION_POLICY`: omit or set `verified-evidence`.

The deployment must install a verified `RequestPrincipalAdapter`, a compliant
`Tier2ExtractionProvider`, and an encrypted off-device `DatabaseBackupProvider` during
server bootstrap. The default principal adapter denies access; test providers cannot be
used as production providers. Firm membership is resolved from stable issuer/subject
identity, and store constraints reject cross-firm matter, computation, and extraction
access. `/api/health` reports process liveness; `/api/readiness` reports only stable,
privacy-safe dependency states. Baseline responses deny framing, suppress referrers and
MIME sniffing, and disable camera, microphone, and geolocation.

## Verification

Run the production build from this directory so Next and Tailwind resolve this app's
configuration:

```bash
node_modules/.bin/next build
```

Repository-level typecheck, validators, goldens, Vitest, evidence/blob validation, and
`git diff --check` remain required. See `BETA-RELEASE-CHECKLIST.md` for the beta go/no-go
and rollback contract.
