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
-- permanently retains ONLY confirmed field VALUES and the rules_version hash.
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
  email       text NOT NULL,
  display_name text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, email)
);

CREATE TABLE IF NOT EXISTS matter (
  id          uuid PRIMARY KEY,
  firm_id     uuid NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
  reference   text NOT NULL,
  title       text NOT NULL,
  client      text,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (firm_id, reference)
);
CREATE INDEX IF NOT EXISTS matter_firm_idx ON matter (firm_id, created_at DESC);

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
  rules_version text NOT NULL,           -- the ruleset hash — the liability shield
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
  output        json NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_firm_idx ON computation_audit (firm_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS audit_matter_idx ON computation_audit (matter_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS audit_hash_idx ON computation_audit (rules_version);

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
