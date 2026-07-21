# StampDraft three-state beta release gate

**Status:** engineering package complete; release remains blocked by explicit legal,
evidence, provider, infrastructure, and real-cohort dependencies.
This checklist is a go/no-go contract; a green draft test suite is not release approval.

## Go/no-go gates

- [ ] Every enabled dependency is founder-verified; unresolved paths still refuse.
- [ ] Every enabled dependency has a valid primary-evidence link and current amendment
  and commencement coverage.
- [ ] Maharashtra IGR/municipal, Karnataka DPAL/commencement/municipal, Delhi
  Schedule/Revenue/MCD, and central securities source families have complete recorded
  runs for the enabled paths.
- [ ] An off-device evidence backup and clean restore have both passed manifest checks.
- [ ] Fixed official-portal canaries have no unexplained divergence on enabled paths.
- [x] Production APIs default to founder-verification and evidence gates.
- [x] Blocked computations return typed, actionable refusals and no amount.
- [x] Audit replay uses the archived hash-validated legal snapshot, not live rules.
- [x] Memo access is firm-scoped and expires after five minutes.
- [x] Real memo PDFs are generated from immutable audit output behind the same capability;
  missing, expired, tampered, and cross-firm tokens are refused before record lookup.
- [x] Dependency-bounded founder packets include exact evidence locators/chains, encoded
  diff, positive/boundary/negative receipts, canary state, and open refusals without
  self-populating verification metadata.
- [x] Beta metric aggregation keeps refusals in coverage and out of conditional
  correctness, with separate canary, Tier 2 edit, replay, and memo reliability measures.
- [x] Baseline security headers, accessible form labels, skip navigation, and live result
  announcements are present.
- [x] Protected routes fail closed without an authentication adapter; stable
  issuer/subject memberships and repository constraints pass cross-firm isolation tests.
- [ ] A production authentication/IdP adapter is installed and exercised with real sessions.
- [x] Forward-only checksummed migrations, privacy-safe health/readiness endpoints,
  append-only readiness checks, and transactional database backup/clean restore pass locally.
- [ ] Production Postgres migrations, encrypted backups, restore, monitoring, and alerting
  have been exercised in the deployment environment.
- [x] Provider-independent PDF/DOCX intake, confirmation UI, deterministic compute/audit
  handoff, compute-and-delete, 30-day expiry, early deletion, and failure states pass.
- [ ] Tier 2 PDF/DOCX intake, India-resident encrypted storage, lifecycle deletion,
  extraction, and mandatory confirmation pass against the selected production provider.
- [ ] The founder-supplied anonymized extraction set meets at least 95% precision on
  consideration, term, and parties.
- [x] The product contains a privacy notice and explicit processing consent; local
  lifecycle tests prove snippets disappear with the document and never enter audit rows.
- [ ] Retention and deletion are verified end to end against production provider storage.
- [x] The provider-neutral retention contract requires India-region storage intent and
  atomic document/snippet deletion for compute-and-delete, timed expiry, and user delete.
  This check does not satisfy the production-storage end-to-end gate above.
- [ ] A qualified reviewer approves product positioning and beta terms.

## Rollback procedure

1. Disable the affected answer path with a new scoped refusal or roll traffic back to the
   last known-good application artifact. Never delete or rewrite a historical rule,
   snapshot, evidence occurrence, or computation row.
2. Preserve the triggering input, rules hash, archived snapshot hash, evidence run IDs,
   canary output, and deployment identifier in the incident record without retaining
   client-document snippets beyond their configured lifecycle.
3. If a legal source or canary changed, keep the path refused while a new append-only era
   and dependency-bounded founder review are prepared. A portal result never edits a rule
   automatically.
4. If a memo capability secret is exposed, rotate it; existing five-minute links become
   invalid. If a database credential is exposed, rotate it separately and verify scoped
   access before restoring traffic.
5. Forward-fix database migrations. Do not roll back by dropping append-only audit or
   snapshot protections. Restore into an isolated database and verify manifests before
   switching the production connection.
6. Re-run typecheck, rule/evidence validation with blobs, eligibility and arithmetic
   goldens, full tests, the production build, and the affected end-to-end scenario before
   re-enabling traffic.

## Beta measurements

- **Answer coverage:** dependency-complete, enabled computations / representative matters.
- **Conditional correctness:** correct enabled computations / enabled computations.
- **Refusal rate:** refusals / representative matters, recorded as coverage gaps rather
  than incorrect answers.
- **Unexplained divergence count:** supported canary mismatches not resolved by source,
  input, timing, or portal-practice analysis; target zero.
- **Tier 2 edit rate:** extracted fields changed at confirmation / extracted fields shown,
  grouped by model version and high-risk field.
- **Audit and memo reliability:** successful exact replays and memo exports / attempts.

No closed beta begins until every unchecked release-blocking item above is either green
or deliberately removed from the enabled product surface with a tested refusal.

Current repository evidence is **0/115 linked**, so no computation path qualifies for a
production answer. Thirteen Maharashtra evidence-link proposals are mechanically valid and
packaged for human review, but are not production links. The unchecked items require
primary-source network access and legal review, founder approval, deployment credentials/infrastructure,
an extraction provider and anonymized evaluation set, or observations from a real beta
cohort; none are simulated by the green offline suite.
