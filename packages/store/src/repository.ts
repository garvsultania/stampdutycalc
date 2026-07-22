import { randomUUID, createHash } from "node:crypto";
import {
  canonicalJson,
  hashSnapshotArchive,
  parseSnapshotArchive,
  type SnapshotArchive,
} from "@stampdraft/engine";
import {
  RedactedExtractionFieldSchema,
  type ComputeOutput,
  type RedactedExtractionField,
} from "@stampdraft/schema";
import type { Db } from "./db.js";
import { getMigrationState } from "./migrations.js";

export interface Firm {
  id: string;
  name: string;
  created_at: string;
}

export interface FirmUser {
  id: string;
  firm_id: string;
  identity_issuer: string;
  identity_subject: string;
  email: string;
  display_name: string;
  created_at: string;
}

export class FirmMembershipError extends Error {
  constructor() {
    super("user is not a member of the requested firm");
    this.name = "FirmMembershipError";
  }
}

export class MatterScopeError extends Error {
  constructor() {
    super("matter does not belong to the requested firm");
    this.name = "MatterScopeError";
  }
}

export interface Matter {
  id: string;
  firm_id: string;
  reference: string;
  title: string;
  client: string | null;
  created_by: string;
  created_at: string;
  archived_at: string | null;
}

export type ExtractionJobStatus = "queued" | "processing" | "completed" | "failed" | "confirmed" | "deleted";
export type ExtractionFailureCode = "provider_failed" | "invalid_provider_output" | "provider_unavailable";

export interface ExtractionJobRecord {
  id: string;
  document_id: string;
  firm_id: string;
  user_email: string;
  provider_id: string;
  document_ref: string | null;
  filename: string;
  media_type: string;
  page_count: number;
  jurisdiction: string;
  rule_id: string;
  execution_date: string;
  retention_policy: "compute_and_delete" | "thirty_days";
  accepted_at: string;
  delete_by: string | null;
  status: ExtractionJobStatus;
  model_version: string | null;
  redacted_fields: RedactedExtractionField[];
  failure_code: ExtractionFailureCode | null;
  confirmed_at: string | null;
  deleted_at: string | null;
  deletion_reason: "confirmation_completed" | "user_deleted" | "retention_expired" | null;
  created_at: string;
  updated_at: string;
}

export interface StoreReadiness {
  ready: boolean;
  schemaVersion: number;
  latestSchemaVersion: number;
  tablesReady: boolean;
  constraintsReady: boolean;
  appendOnlyReady: boolean;
  archiveIntegrityReady: boolean;
}

export interface AuditRecord {
  id: string;
  firm_id: string;
  matter_id: string | null;
  user_email: string;
  computed_at: string;
  jurisdiction: string;
  rule_id: string;
  execution_date: string;
  input_values: Record<string, string | number>;
  input_facts: Record<string, string | number>;
  duty_paid: string | null;
  penalty_months: number | null;
  rules_version: string;
  engine_version: string;
  extraction_model_version: string | null;
  total_duty: string;
  output: ComputeOutput;
}

export interface SnapshotArchiveRecord {
  rules_version: string;
  jurisdiction: string;
  payload: SnapshotArchive;
  archived_at: string;
}

interface SnapshotArchiveRow extends Omit<SnapshotArchiveRecord, "payload"> {
  payload: string;
}

/**
 * Audit columns, with `execution_date` cast to text IN SQL.
 *
 * This is deliberate. A Postgres `date` read through a driver arrives as a JS Date
 * at local midnight; formatting it back in a non-UTC timezone can shift it by a
 * day. execution_date decides WHICH VERSION OF THE LAW APPLIES, so a silent
 * one-day drift could select the wrong rate — exactly the class of error this
 * product exists to eliminate. Casting server-side means no Date is ever built.
 */
const AUDIT_COLS = `id, firm_id, matter_id, user_email, computed_at, jurisdiction, rule_id,
  execution_date::text AS execution_date, input_values, input_facts, duty_paid,
  penalty_months, rules_version, engine_version, extraction_model_version, total_duty, output`;

/** timestamptz is an instant, so Date→ISO is lossless; normalise for the UI. */
function normalise<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const k of [
    "computed_at", "created_at", "archived_at", "last_used_at", "revoked_at",
    "accepted_at", "delete_by", "confirmed_at", "deleted_at", "updated_at",
  ]) {
    if (out[k] instanceof Date) out[k] = (out[k] as Date).toISOString();
  }
  return out as T;
}

function normaliseExtraction(row: ExtractionJobRecord): ExtractionJobRecord {
  const normalized = normalise(row);
  if (!Array.isArray(normalized.redacted_fields)) {
    throw new Error("extraction job contains invalid redacted field state");
  }
  return {
    ...normalized,
    redacted_fields: normalized.redacted_fields.map((field) => RedactedExtractionFieldSchema.parse(field)),
  };
}

const EXTRACTION_COLS = `id, document_id, firm_id, user_email, provider_id, document_ref,
  filename, media_type, page_count, jurisdiction, rule_id, execution_date::text AS execution_date,
  retention_policy, accepted_at, delete_by, status, model_version, redacted_fields,
  failure_code, confirmed_at, deleted_at, deletion_reason, created_at, updated_at`;

export interface RecordComputationArgs {
  firmId: string;
  matterId?: string | null;
  userEmail: string;
  output: ComputeOutput;
  snapshotArchive: SnapshotArchive;
  engineVersion: string;
  penaltyMonths?: number | null;
  /** Tier 2 only (M4): the model that produced the fields the lawyer confirmed. */
  extractionModelVersion?: string | null;
  /** Optional stable idempotency key. Tier 2 uses its extraction job UUID so a
   * retry after a provider/DB partial failure cannot append a duplicate audit. */
  recordId?: string;
}

/**
 * Data access for the firm workspace. Business logic depends on this interface,
 * not on the driver — swapping PGlite for a managed Postgres changes nothing above.
 */
export class Store {
  constructor(private readonly db: Db) {}

  async checkReadiness(): Promise<StoreReadiness> {
    const migration = await getMigrationState(this.db);
    const requiredTables = [
      "firm", "firm_user", "matter", "rules_snapshot_archive", "computation_audit", "extraction_job", "api_key",
    ];
    const { rows: tableRows } = await this.db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN
          ('firm','firm_user','matter','rules_snapshot_archive','computation_audit','extraction_job','api_key')`,
    );
    const tables = new Set(tableRows.map((row) => row.table_name));
    const requiredTriggers = [
      "computation_audit:computation_audit_no_update",
      "computation_audit:computation_audit_no_delete",
      "rules_snapshot_archive:rules_snapshot_archive_no_update",
      "rules_snapshot_archive:rules_snapshot_archive_no_delete",
    ];
    const { rows: triggerRows } = await this.db.query<{ table_name: string; tgname: string }>(
      `SELECT c.relname AS table_name, t.tgname
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname IN
          ('computation_audit_no_update','computation_audit_no_delete',
           'rules_snapshot_archive_no_update','rules_snapshot_archive_no_delete')`,
    );
    const triggers = new Set(triggerRows.map((row) => `${row.table_name}:${row.tgname}`));
    const requiredConstraints = [
      "firm_user_identity_unique", "matter_firm_id_unique", "matter_creator_membership_fk",
      "audit_user_membership_fk", "audit_matter_firm_fk", "audit_rules_snapshot_fk",
      "extraction_job_firm_id_unique", "extraction_job_user_membership_fk",
    ];
    const { rows: constraintRows } = await this.db.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conname IN
        ('firm_user_identity_unique','matter_firm_id_unique','matter_creator_membership_fk',
         'audit_user_membership_fk','audit_matter_firm_fk','audit_rules_snapshot_fk',
         'extraction_job_firm_id_unique','extraction_job_user_membership_fk')`,
    );
    const constraints = new Set(constraintRows.map((row) => row.conname));
    const { rows: orphanRows } = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM computation_audit a
         LEFT JOIN rules_snapshot_archive s ON s.rules_version = a.rules_version
        WHERE s.rules_version IS NULL`,
    );
    const tablesReady = requiredTables.every((table) => tables.has(table));
    const constraintsReady = requiredConstraints.every((constraint) => constraints.has(constraint));
    const appendOnlyReady = requiredTriggers.every((trigger) => triggers.has(trigger));
    const archiveIntegrityReady = orphanRows[0]?.count === "0";
    const schemaReady = migration.pendingVersions.length === 0 &&
      migration.currentVersion === migration.latestVersion;
    return {
      ready: schemaReady && tablesReady && constraintsReady && appendOnlyReady && archiveIntegrityReady,
      schemaVersion: migration.currentVersion,
      latestSchemaVersion: migration.latestVersion,
      tablesReady,
      constraintsReady,
      appendOnlyReady,
      archiveIntegrityReady,
    };
  }

  // ——— firms & users ———

  async createFirm(name: string): Promise<Firm> {
    const id = randomUUID();
    const { rows } = await this.db.query<Firm>(
      "INSERT INTO firm (id, name) VALUES ($1, $2) RETURNING *",
      [id, name],
    );
    return normalise(rows[0]!);
  }

  async getFirm(id: string): Promise<Firm | null> {
    const { rows } = await this.db.query<Firm>("SELECT * FROM firm WHERE id = $1", [id]);
    return rows[0] ? normalise(rows[0]) : null;
  }

  /** Idempotent bootstrap so a fresh install has somewhere to write. */
  async ensureFirm(name: string): Promise<Firm> {
    const { rows } = await this.db.query<Firm>("SELECT * FROM firm WHERE name = $1 LIMIT 1", [name]);
    return rows[0] ? normalise(rows[0]) : await this.createFirm(name);
  }

  async addUser(
    firmId: string,
    email: string,
    displayName: string,
    identity: { issuer: string; subject: string } = { issuer: "legacy-email", subject: email.trim().toLowerCase() },
  ): Promise<FirmUser> {
    const normalizedEmail = email.trim().toLowerCase();
    const issuer = identity.issuer.trim();
    const subject = identity.subject.trim();
    if (!normalizedEmail || !issuer || !subject) throw new Error("firm user identity is incomplete");
    await this.db.query(
      `INSERT INTO firm_user (id, firm_id, identity_issuer, identity_subject, email, display_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (firm_id, email) DO UPDATE SET
         identity_issuer = CASE
           WHEN firm_user.identity_issuer = 'legacy-email' OR
                (firm_user.identity_issuer = EXCLUDED.identity_issuer AND
                 firm_user.identity_subject = EXCLUDED.identity_subject)
           THEN EXCLUDED.identity_issuer ELSE firm_user.identity_issuer END,
         identity_subject = CASE
           WHEN firm_user.identity_issuer = 'legacy-email' OR
                (firm_user.identity_issuer = EXCLUDED.identity_issuer AND
                 firm_user.identity_subject = EXCLUDED.identity_subject)
           THEN EXCLUDED.identity_subject ELSE firm_user.identity_subject END,
         display_name = EXCLUDED.display_name`,
      [randomUUID(), firmId, issuer, subject, normalizedEmail, displayName.trim()],
    );
    const member = await this.getFirmUserByIdentity(firmId, issuer, subject);
    if (!member || member.email !== normalizedEmail) {
      throw new Error("firm user identity conflicts with an existing membership");
    }
    return member;
  }

  async getFirmUserByIdentity(firmId: string, issuer: string, subject: string): Promise<FirmUser | null> {
    const { rows } = await this.db.query<FirmUser>(
      `SELECT * FROM firm_user
        WHERE firm_id = $1 AND identity_issuer = $2 AND identity_subject = $3`,
      [firmId, issuer, subject],
    );
    return rows[0] ? normalise(rows[0]) : null;
  }

  async requireFirmUser(firmId: string, email: string): Promise<FirmUser> {
    const { rows } = await this.db.query<FirmUser>(
      "SELECT * FROM firm_user WHERE firm_id = $1 AND email = $2",
      [firmId, email.trim().toLowerCase()],
    );
    if (!rows[0]) throw new FirmMembershipError();
    return normalise(rows[0]);
  }

  // ——— matters ———

  async createMatter(args: {
    firmId: string;
    reference: string;
    title: string;
    client?: string | null;
    createdBy: string;
  }): Promise<Matter> {
    const member = await this.requireFirmUser(args.firmId, args.createdBy);
    const { rows } = await this.db.query<Matter>(
      `INSERT INTO matter (id, firm_id, reference, title, client, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [randomUUID(), args.firmId, args.reference, args.title, args.client ?? null, member.email],
    );
    return normalise(rows[0]!);
  }

  async listMatters(firmId: string): Promise<Array<Matter & { computation_count: number }>> {
    const { rows } = await this.db.query<Matter & { computation_count: string }>(
      `SELECT m.*, COUNT(a.id) AS computation_count
         FROM matter m
         LEFT JOIN computation_audit a ON a.matter_id = m.id AND a.firm_id = m.firm_id
        WHERE m.firm_id = $1 AND m.archived_at IS NULL
        GROUP BY m.id
        ORDER BY m.created_at DESC`,
      [firmId],
    );
    return rows.map((r) => normalise({ ...r, computation_count: Number(r.computation_count) }));
  }

  async getMatter(firmId: string, matterId: string): Promise<Matter | null> {
    const { rows } = await this.db.query<Matter>(
      "SELECT * FROM matter WHERE id = $1 AND firm_id = $2",
      [matterId, firmId],
    );
    return rows[0] ? normalise(rows[0]) : null;
  }

  // ——— Tier 2 extraction lifecycle ———

  async createExtractionJob(args: {
    id: string;
    documentId: string;
    firmId: string;
    userEmail: string;
    providerId: string;
    documentRef: string;
    filename: string;
    mediaType: string;
    pageCount: number;
    jurisdiction: string;
    ruleId: string;
    executionDate: string;
    retentionPolicy: "compute_and_delete" | "thirty_days";
    acceptedAt: string;
    deleteBy: string | null;
  }): Promise<ExtractionJobRecord> {
    const member = await this.requireFirmUser(args.firmId, args.userEmail);
    const { rows } = await this.db.query<ExtractionJobRecord>(
      `INSERT INTO extraction_job (
         id, document_id, firm_id, user_email, provider_id, document_ref,
         filename, media_type, page_count, jurisdiction, rule_id, execution_date,
         retention_policy, accepted_at, delete_by, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'queued')
       RETURNING ${EXTRACTION_COLS}`,
      [
        args.id, args.documentId, args.firmId, member.email, args.providerId, args.documentRef,
        args.filename, args.mediaType, args.pageCount, args.jurisdiction, args.ruleId, args.executionDate,
        args.retentionPolicy, args.acceptedAt, args.deleteBy,
      ],
    );
    return normaliseExtraction(rows[0]!);
  }

  async getExtractionJob(firmId: string, id: string): Promise<ExtractionJobRecord | null> {
    const { rows } = await this.db.query<ExtractionJobRecord>(
      `SELECT ${EXTRACTION_COLS} FROM extraction_job WHERE firm_id = $1 AND id = $2`,
      [firmId, id],
    );
    return rows[0] ? normaliseExtraction(rows[0]) : null;
  }

  async markExtractionProcessing(firmId: string, id: string): Promise<ExtractionJobRecord> {
    return this.transitionExtraction(
      `UPDATE extraction_job SET status = 'processing', updated_at = now()
        WHERE firm_id = $1 AND id = $2 AND status = 'queued'
        RETURNING ${EXTRACTION_COLS}`,
      [firmId, id],
    );
  }

  async completeExtractionJob(
    firmId: string,
    id: string,
    modelVersion: string,
    redactedFields: RedactedExtractionField[],
  ): Promise<ExtractionJobRecord> {
    const fields = redactedFields.map((field) => RedactedExtractionFieldSchema.parse(field));
    return this.transitionExtraction(
      `UPDATE extraction_job
          SET status = 'completed', model_version = $3, redacted_fields = $4,
              failure_code = NULL, updated_at = now()
        WHERE firm_id = $1 AND id = $2 AND status = 'processing'
        RETURNING ${EXTRACTION_COLS}`,
      [firmId, id, modelVersion, JSON.stringify(fields)],
    );
  }

  async failExtractionJob(
    firmId: string,
    id: string,
    failureCode: ExtractionFailureCode,
  ): Promise<ExtractionJobRecord> {
    return this.transitionExtraction(
      `UPDATE extraction_job
          SET status = 'failed', failure_code = $3, redacted_fields = '[]'::jsonb,
              updated_at = now()
        WHERE firm_id = $1 AND id = $2 AND status IN ('queued', 'processing')
        RETURNING ${EXTRACTION_COLS}`,
      [firmId, id, failureCode],
    );
  }

  async confirmExtractionJob(firmId: string, id: string, confirmedAt: string): Promise<ExtractionJobRecord> {
    return this.transitionExtraction(
      `UPDATE extraction_job
          SET status = 'confirmed', confirmed_at = $3, updated_at = now()
        WHERE firm_id = $1 AND id = $2 AND status = 'completed'
        RETURNING ${EXTRACTION_COLS}`,
      [firmId, id, confirmedAt],
    );
  }

  async deleteExtractionJob(
    firmId: string,
    id: string,
    deletedAt: string,
    reason: "confirmation_completed" | "user_deleted" | "retention_expired",
  ): Promise<ExtractionJobRecord> {
    const existing = await this.getExtractionJob(firmId, id);
    if (!existing) throw new Error("extraction job not found");
    if (existing.status === "deleted") return existing;
    return this.transitionExtraction(
      `UPDATE extraction_job
          SET status = 'deleted', document_ref = NULL, filename = '[deleted]', redacted_fields = '[]'::jsonb,
              failure_code = NULL, deleted_at = $3, deletion_reason = $4,
              confirmed_at = CASE WHEN $4 = 'confirmation_completed' THEN $3 ELSE confirmed_at END,
              updated_at = now()
        WHERE firm_id = $1 AND id = $2 AND status <> 'deleted'
        RETURNING ${EXTRACTION_COLS}`,
      [firmId, id, deletedAt, reason],
    );
  }

  async listExpiredExtractionJobs(now: string, limit = 100): Promise<ExtractionJobRecord[]> {
    const { rows } = await this.db.query<ExtractionJobRecord>(
      `SELECT ${EXTRACTION_COLS} FROM extraction_job
        WHERE status <> 'deleted' AND (
          (retention_policy = 'thirty_days' AND delete_by IS NOT NULL AND delete_by <= $1) OR
          (retention_policy = 'compute_and_delete' AND status = 'confirmed') OR
          (retention_policy = 'compute_and_delete' AND accepted_at <= $1::timestamptz - interval '24 hours')
        )
        ORDER BY COALESCE(delete_by, accepted_at) ASC LIMIT $2`,
      [now, limit],
    );
    return rows.map(normaliseExtraction);
  }

  private async transitionExtraction(sql: string, params: unknown[]): Promise<ExtractionJobRecord> {
    const { rows } = await this.db.query<ExtractionJobRecord>(sql, params);
    if (!rows[0]) throw new Error("invalid extraction job state transition");
    return normaliseExtraction(rows[0]);
  }

  // ——— the audit log (append-only) ———

  /** Persist one canonical legal snapshot, deduplicated by its content hash. */
  async archiveSnapshot(snapshotArchive: SnapshotArchive): Promise<SnapshotArchiveRecord> {
    const payload = parseSnapshotArchive(snapshotArchive);
    const rulesVersion = hashSnapshotArchive(payload);
    const canonicalPayload = canonicalJson(payload);
    await this.db.query(
      `INSERT INTO rules_snapshot_archive (rules_version, jurisdiction, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (rules_version) DO NOTHING`,
      [rulesVersion, payload.jurisdiction, canonicalPayload],
    );

    const stored = await this.getSnapshotArchive(rulesVersion);
    if (!stored) throw new Error(`snapshot archive ${rulesVersion} was not persisted`);
    if (canonicalJson(stored.payload) !== canonicalPayload) {
      throw new Error(`snapshot archive collision for ${rulesVersion}`);
    }
    return stored;
  }

  /** Load and independently validate a content-addressed legal snapshot. */
  async getSnapshotArchive(rulesVersion: string): Promise<SnapshotArchiveRecord | null> {
    const { rows } = await this.db.query<SnapshotArchiveRow>(
      `SELECT rules_version, jurisdiction, payload, archived_at
         FROM rules_snapshot_archive WHERE rules_version = $1`,
      [rulesVersion],
    );
    const row = rows[0];
    if (!row) return null;

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(row.payload);
    } catch (error) {
      throw new Error(
        `snapshot archive ${rulesVersion} is malformed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const payload = parseSnapshotArchive(rawPayload);
    const canonicalPayload = canonicalJson(payload);
    if (canonicalPayload !== row.payload) {
      throw new Error(`snapshot archive ${rulesVersion} is not canonically serialised`);
    }
    const actualRulesVersion = hashSnapshotArchive(payload);
    if (actualRulesVersion !== rulesVersion) {
      throw new Error(
        `snapshot archive hash mismatch: expected ${rulesVersion}, recomputed ${actualRulesVersion}`,
      );
    }
    if (payload.jurisdiction !== row.jurisdiction) {
      throw new Error(
        `snapshot archive jurisdiction mismatch: row says ${row.jurisdiction}, payload says ${payload.jurisdiction}`,
      );
    }
    return normalise({ ...row, payload });
  }

  /**
   * Record a computation. There is deliberately no update or delete counterpart:
   * the table refuses both at the database level (PRD §7). A correction is a new
   * record, so the log shows what was actually relied upon and when.
   */
  async recordComputation(args: RecordComputationArgs): Promise<AuditRecord> {
    const o = args.output;
    const member = await this.requireFirmUser(args.firmId, args.userEmail);
    if (args.matterId && !await this.getMatter(args.firmId, args.matterId)) {
      throw new MatterScopeError();
    }
    const archiveRulesVersion = hashSnapshotArchive(args.snapshotArchive);
    if (archiveRulesVersion !== o.rules_version) {
      throw new Error(
        `computation rules_version ${o.rules_version} does not match snapshot archive ${archiveRulesVersion}`,
      );
    }
    await this.archiveSnapshot(args.snapshotArchive);

    const recordId = args.recordId ?? randomUUID();
    const { rows } = await this.db.query<AuditRecord>(
      `INSERT INTO computation_audit (
         id, firm_id, matter_id, user_email, jurisdiction, rule_id, execution_date,
         input_values, input_facts, duty_paid, penalty_months, rules_version,
         engine_version, extraction_model_version, total_duty, output
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO NOTHING
       RETURNING ${AUDIT_COLS}`,
      [
        recordId,
        args.firmId,
        args.matterId ?? null,
        member.email,
        o.jurisdiction,
        o.rule_id,
        o.execution_date,
        JSON.stringify(o.inputs_echo.values),
        JSON.stringify(o.inputs_echo.facts),
        o.inputs_echo.duty_paid !== undefined ? String(o.inputs_echo.duty_paid) : null,
        args.penaltyMonths ?? null,
        o.rules_version,
        args.engineVersion,
        args.extractionModelVersion ?? null,
        o.total_duty,
        JSON.stringify(o),
      ],
    );
    if (rows[0]) return normalise(rows[0]);

    const existing = await this.getComputation(args.firmId, recordId);
    if (
      !existing || existing.matter_id !== (args.matterId ?? null) ||
      existing.user_email !== member.email || existing.rules_version !== o.rules_version ||
      existing.engine_version !== args.engineVersion ||
      existing.extraction_model_version !== (args.extractionModelVersion ?? null) ||
      existing.penalty_months !== (args.penaltyMonths ?? null) ||
      canonicalJson(existing.output) !== canonicalJson(o)
    ) {
      throw new Error("computation idempotency key conflicts with a different audit record");
    }
    return existing;
  }

  async listComputations(firmId: string, matterId?: string, limit = 100): Promise<AuditRecord[]> {
    const { rows } = matterId
      ? await this.db.query<AuditRecord>(
          `SELECT ${AUDIT_COLS} FROM computation_audit WHERE firm_id = $1 AND matter_id = $2
            ORDER BY computed_at DESC LIMIT $3`,
          [firmId, matterId, limit],
        )
      : await this.db.query<AuditRecord>(
          `SELECT ${AUDIT_COLS} FROM computation_audit WHERE firm_id = $1 ORDER BY computed_at DESC LIMIT $2`,
          [firmId, limit],
        );
    return rows.map(normalise);
  }

  async getComputation(firmId: string, id: string): Promise<AuditRecord | null> {
    const { rows } = await this.db.query<AuditRecord>(
      `SELECT ${AUDIT_COLS} FROM computation_audit WHERE id = $1 AND firm_id = $2`,
      [id, firmId],
    );
    return rows[0] ? normalise(rows[0]) : null;
  }

  // ——— API keys ———

  /** Returns the plaintext key ONCE; only its hash is persisted. */
  async createApiKey(firmId: string, name: string): Promise<{ id: string; key: string }> {
    const key = `sd_${randomUUID().replace(/-/g, "")}`;
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO api_key (id, firm_id, name, key_hash) VALUES ($1, $2, $3, $4)",
      [id, firmId, name, hashKey(key)],
    );
    return { id, key };
  }

  async resolveApiKey(key: string): Promise<{ firm_id: string; id: string } | null> {
    const { rows } = await this.db.query<{ firm_id: string; id: string }>(
      "SELECT id, firm_id FROM api_key WHERE key_hash = $1 AND revoked_at IS NULL",
      [hashKey(key)],
    );
    const hit = rows[0];
    if (!hit) return null;
    await this.db.query("UPDATE api_key SET last_used_at = now() WHERE id = $1", [hit.id]);
    return hit;
  }

  async revokeApiKey(firmId: string, id: string): Promise<void> {
    await this.db.query("UPDATE api_key SET revoked_at = now() WHERE id = $1 AND firm_id = $2", [id, firmId]);
  }
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
