/**
 * The StampDraft schema, as a module constant.
 *
 * Deliberately not a .sql file read at runtime: bundlers statically resolve
 * `new URL('./x.sql', import.meta.url)` and fail on the unresolvable asset, and a
 * separate file is one more thing that can drift from the code that applies it.
 * This string is the single source of truth — apply it with `migrate(db)`, or
 * paste it into psql; it is plain Postgres DDL either way.
 */
export const SCHEMA_SQL = String.raw`
-- StampDraft persistence — firm workspace + immutable audit log (PRD §7, Flow E).
--
-- RETENTION (founder amendment A1, supersedes the §7 ambiguity): this schema
-- permanently retains confirmed field VALUES, the rules_version hash, and the
-- canonical legal snapshot identified by that hash. Snapshot archives contain
-- no client or document data; they are the encoded law needed for replay.
-- Verbatim document snippets are deliberately ABSENT — they follow the uploaded
-- document's lifecycle (document deleted ⇒ snippets deleted) and will live on the
-- document tables in M4. Confirmed values persist because the lawyer affirmatively
-- entered them; together with the hash they reproduce the output byte-for-byte,
-- so reproducibility never depends on retaining personal data from a deed.

CREATE TABLE IF NOT EXISTS firm (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS firm_user (
  id          uuid PRIMARY KEY,
  firm_id     uuid NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
  identity_issuer text NOT NULL,
  identity_subject text NOT NULL,
  email       text NOT NULL,
  display_name text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firm_user_firm_email_unique UNIQUE (firm_id, email),
  CONSTRAINT firm_user_identity_unique UNIQUE (firm_id, identity_issuer, identity_subject)
);

-- Upgrade the pre-auth foundation in place. Legacy rows retain a stable,
-- explicitly named email identity until a deployment provisions its IdP mapping.
ALTER TABLE firm_user ADD COLUMN IF NOT EXISTS identity_issuer text;
ALTER TABLE firm_user ADD COLUMN IF NOT EXISTS identity_subject text;
UPDATE firm_user
   SET identity_issuer = COALESCE(identity_issuer, 'legacy-email'),
       identity_subject = COALESCE(identity_subject, lower(email));
ALTER TABLE firm_user ALTER COLUMN identity_issuer SET NOT NULL;
ALTER TABLE firm_user ALTER COLUMN identity_subject SET NOT NULL;

CREATE TABLE IF NOT EXISTS matter (
  id          uuid PRIMARY KEY,
  firm_id     uuid NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
  reference   text NOT NULL,
  title       text NOT NULL,
  client      text,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT matter_firm_reference_unique UNIQUE (firm_id, reference),
  CONSTRAINT matter_firm_id_unique UNIQUE (firm_id, id),
  CONSTRAINT matter_creator_membership_fk FOREIGN KEY (firm_id, created_by)
    REFERENCES firm_user(firm_id, email) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS matter_firm_idx ON matter (firm_id, created_at DESC);

-- Tier 2 job state contains no document bytes, proposed values, or snippets.
-- Those remain in the provider lifecycle and are erased together. Only this
-- redacted operational receipt and field-presence summary are persisted here.
CREATE TABLE IF NOT EXISTS extraction_job (
  id             uuid PRIMARY KEY,
  document_id    uuid NOT NULL UNIQUE,
  firm_id        uuid NOT NULL REFERENCES firm(id) ON DELETE RESTRICT,
  user_email     text NOT NULL,
  provider_id    text NOT NULL,
  document_ref   text,
  filename       text NOT NULL,
  media_type     text NOT NULL,
  page_count     integer NOT NULL CHECK (page_count BETWEEN 1 AND 60),
  jurisdiction   text NOT NULL,
  rule_id        text NOT NULL,
  execution_date date NOT NULL,
  retention_policy text NOT NULL CHECK (retention_policy IN ('compute_and_delete', 'thirty_days')),
  accepted_at    timestamptz NOT NULL,
  delete_by      timestamptz,
  status         text NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'confirmed', 'deleted')),
  model_version  text,
  redacted_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_code   text,
  confirmed_at   timestamptz,
  deleted_at     timestamptz,
  deletion_reason text CHECK (deletion_reason IN ('confirmation_completed', 'user_deleted', 'retention_expired')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extraction_job_firm_id_unique UNIQUE (firm_id, id),
  CONSTRAINT extraction_job_user_membership_fk FOREIGN KEY (firm_id, user_email)
    REFERENCES firm_user(firm_id, email) ON DELETE RESTRICT,
  CONSTRAINT extraction_job_retention_deadline CHECK (
    (retention_policy = 'compute_and_delete' AND delete_by IS NULL) OR
    (retention_policy = 'thirty_days' AND delete_by IS NOT NULL)
  ),
  CONSTRAINT extraction_job_deleted_state CHECK (
    (status = 'deleted' AND document_ref IS NULL AND deleted_at IS NOT NULL AND deletion_reason IS NOT NULL) OR
    (status <> 'deleted' AND document_ref IS NOT NULL AND deleted_at IS NULL AND deletion_reason IS NULL)
  ),
  CONSTRAINT extraction_job_failure_state CHECK (
    (status = 'failed' AND failure_code IS NOT NULL AND
      failure_code IN ('provider_failed', 'invalid_provider_output', 'provider_unavailable')) OR
    (status <> 'failed' AND failure_code IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS extraction_job_firm_idx ON extraction_job (firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS extraction_job_retention_idx
  ON extraction_job (delete_by) WHERE status <> 'deleted' AND delete_by IS NOT NULL;

-- Canonical active-law payloads, content-addressed by the same SHA-256 identity
-- written to every computation. TEXT is deliberate: it preserves the exact
-- canonical serialisation that was hashed rather than allowing JSON storage to
-- rewrite it. Identical snapshots are stored once and shared by audit records.
CREATE TABLE IF NOT EXISTS rules_snapshot_archive (
  rules_version text PRIMARY KEY,
  jurisdiction text NOT NULL,
  payload       text NOT NULL,
  archived_at   timestamptz NOT NULL DEFAULT now()
);

-- The audit log. Every computation a professional relies on lands here, exactly once.
CREATE TABLE IF NOT EXISTS computation_audit (
  id            uuid PRIMARY KEY,
  firm_id       uuid NOT NULL REFERENCES firm(id) ON DELETE RESTRICT,
  matter_id     uuid REFERENCES matter(id) ON DELETE RESTRICT,
  user_email    text NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT now(),

  -- ——— the reproducibility triple: {inputs, rules_version} ⇒ output ———
  jurisdiction  text NOT NULL,
  rule_id       text NOT NULL,
  execution_date date NOT NULL,
  input_values  jsonb NOT NULL,          -- confirmed numeric inputs (permanent, A1)
  input_facts   jsonb NOT NULL,          -- confirmed categorical inputs (permanent, A1)
  duty_paid     text,                    -- Flow D only
  penalty_months integer,                -- Flow D, per-month regimes
  rules_version text NOT NULL,
                                            -- the ruleset hash — the liability shield
  engine_version text NOT NULL,

  -- Tier 2 (M4): which extraction model produced the fields the lawyer confirmed.
  -- Logged so edit-rate shifts can be correlated to model swaps (PRD §6.4).
  extraction_model_version text,

  -- ——— the output, as it was shown ———
  total_duty    text NOT NULL,
  -- 'json', NOT 'jsonb', deliberately: jsonb normalises and REORDERS keys, so a
  -- jsonb round-trip could not satisfy the §7 "byte-for-byte" claim. This column
  -- is the audit artifact — it must hold exactly the bytes the professional was
  -- shown. (input_values/input_facts stay jsonb: they are queried, and equality
  -- there is semantic, not textual.)
  output        json NOT NULL,

  CONSTRAINT audit_user_membership_fk FOREIGN KEY (firm_id, user_email)
    REFERENCES firm_user(firm_id, email) ON DELETE RESTRICT,
  CONSTRAINT audit_matter_firm_fk FOREIGN KEY (firm_id, matter_id)
    REFERENCES matter(firm_id, id) ON DELETE RESTRICT,
  CONSTRAINT audit_rules_snapshot_fk FOREIGN KEY (rules_version)
    REFERENCES rules_snapshot_archive(rules_version) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS audit_firm_idx ON computation_audit (firm_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS audit_matter_idx ON computation_audit (matter_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS audit_hash_idx ON computation_audit (rules_version);

-- Existing databases predate the composite tenant constraints above. Add and
-- validate the same invariants rather than relying on application query scopes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'firm_user_identity_unique') THEN
    ALTER TABLE firm_user ADD CONSTRAINT firm_user_identity_unique
      UNIQUE (firm_id, identity_issuer, identity_subject);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matter_firm_id_unique') THEN
    ALTER TABLE matter ADD CONSTRAINT matter_firm_id_unique UNIQUE (firm_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matter_creator_membership_fk') THEN
    ALTER TABLE matter ADD CONSTRAINT matter_creator_membership_fk
      FOREIGN KEY (firm_id, created_by) REFERENCES firm_user(firm_id, email) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_user_membership_fk') THEN
    ALTER TABLE computation_audit ADD CONSTRAINT audit_user_membership_fk
      FOREIGN KEY (firm_id, user_email) REFERENCES firm_user(firm_id, email) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_matter_firm_fk') THEN
    ALTER TABLE computation_audit ADD CONSTRAINT audit_matter_firm_fk
      FOREIGN KEY (firm_id, matter_id) REFERENCES matter(firm_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_rules_snapshot_fk') THEN
    ALTER TABLE computation_audit ADD CONSTRAINT audit_rules_snapshot_fk
      FOREIGN KEY (rules_version) REFERENCES rules_snapshot_archive(rules_version) ON DELETE RESTRICT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Existing databases whose computation_audit table predates the foreign key
-- still receive equivalent enforcement when this idempotent schema is applied.
CREATE OR REPLACE FUNCTION computation_audit_requires_snapshot() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM rules_snapshot_archive WHERE rules_version = NEW.rules_version
  ) THEN
    RAISE EXCEPTION 'snapshot archive % must exist before computation_audit insert', NEW.rules_version;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS computation_audit_snapshot_required ON computation_audit;
CREATE TRIGGER computation_audit_snapshot_required
  BEFORE INSERT ON computation_audit
  FOR EACH ROW EXECUTE FUNCTION computation_audit_requires_snapshot();

-- IMMUTABILITY, enforced by the database rather than by convention.
-- PRD §7 requires the audit log be immutable; application-layer discipline is not
-- an enforcement mechanism, so UPDATE and DELETE are refused outright. Correcting
-- a computation means appending a new record — the history of what was relied upon
-- is exactly what makes the log worth having in a dispute.
CREATE OR REPLACE FUNCTION computation_audit_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'computation_audit is append-only (PRD §7): % is refused. Append a new computation instead.', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS computation_audit_no_update ON computation_audit;
CREATE TRIGGER computation_audit_no_update
  BEFORE UPDATE ON computation_audit
  FOR EACH ROW EXECUTE FUNCTION computation_audit_is_append_only();

DROP TRIGGER IF EXISTS computation_audit_no_delete ON computation_audit;
CREATE TRIGGER computation_audit_no_delete
  BEFORE DELETE ON computation_audit
  FOR EACH ROW EXECUTE FUNCTION computation_audit_is_append_only();

CREATE OR REPLACE FUNCTION rules_snapshot_archive_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'rules_snapshot_archive is append-only: % is refused.', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rules_snapshot_archive_no_update ON rules_snapshot_archive;
CREATE TRIGGER rules_snapshot_archive_no_update
  BEFORE UPDATE ON rules_snapshot_archive
  FOR EACH ROW EXECUTE FUNCTION rules_snapshot_archive_is_append_only();

DROP TRIGGER IF EXISTS rules_snapshot_archive_no_delete ON rules_snapshot_archive;
CREATE TRIGGER rules_snapshot_archive_no_delete
  BEFORE DELETE ON rules_snapshot_archive
  FOR EACH ROW EXECUTE FUNCTION rules_snapshot_archive_is_append_only();

-- API keys for volume users (PRD Flow E). Only the hash is stored.
CREATE TABLE IF NOT EXISTS api_key (
  id           uuid PRIMARY KEY,
  firm_id      uuid NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
  name         text NOT NULL,
  key_hash     text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS api_key_firm_idx ON api_key (firm_id);
`;
