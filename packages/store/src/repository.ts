import { randomUUID, createHash } from "node:crypto";
import type { ComputeOutput } from "@stampdraft/schema";
import type { Db } from "./db.js";

export interface Firm {
  id: string;
  name: string;
  created_at: string;
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
function normalise<T extends { computed_at?: unknown; created_at?: unknown }>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const k of ["computed_at", "created_at", "archived_at", "last_used_at", "revoked_at"]) {
    if (out[k] instanceof Date) out[k] = (out[k] as Date).toISOString();
  }
  return out as T;
}

export interface RecordComputationArgs {
  firmId: string;
  matterId?: string | null;
  userEmail: string;
  output: ComputeOutput;
  engineVersion: string;
  penaltyMonths?: number | null;
  /** Tier 2 only (M4): the model that produced the fields the lawyer confirmed. */
  extractionModelVersion?: string | null;
}

/**
 * Data access for the firm workspace. Business logic depends on this interface,
 * not on the driver — swapping PGlite for a managed Postgres changes nothing above.
 */
export class Store {
  constructor(private readonly db: Db) {}

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

  async addUser(firmId: string, email: string, displayName: string): Promise<void> {
    await this.db.query(
      `INSERT INTO firm_user (id, firm_id, email, display_name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (firm_id, email) DO NOTHING`,
      [randomUUID(), firmId, email, displayName],
    );
  }

  // ——— matters ———

  async createMatter(args: {
    firmId: string;
    reference: string;
    title: string;
    client?: string | null;
    createdBy: string;
  }): Promise<Matter> {
    const { rows } = await this.db.query<Matter>(
      `INSERT INTO matter (id, firm_id, reference, title, client, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [randomUUID(), args.firmId, args.reference, args.title, args.client ?? null, args.createdBy],
    );
    return normalise(rows[0]!);
  }

  async listMatters(firmId: string): Promise<Array<Matter & { computation_count: number }>> {
    const { rows } = await this.db.query<Matter & { computation_count: string }>(
      `SELECT m.*, COUNT(a.id) AS computation_count
         FROM matter m
         LEFT JOIN computation_audit a ON a.matter_id = m.id
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

  // ——— the audit log (append-only) ———

  /**
   * Record a computation. There is deliberately no update or delete counterpart:
   * the table refuses both at the database level (PRD §7). A correction is a new
   * record, so the log shows what was actually relied upon and when.
   */
  async recordComputation(args: RecordComputationArgs): Promise<AuditRecord> {
    const o = args.output;
    const { rows } = await this.db.query<AuditRecord>(
      `INSERT INTO computation_audit (
         id, firm_id, matter_id, user_email, jurisdiction, rule_id, execution_date,
         input_values, input_facts, duty_paid, penalty_months, rules_version,
         engine_version, extraction_model_version, total_duty, output
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING ${AUDIT_COLS}`,
      [
        randomUUID(),
        args.firmId,
        args.matterId ?? null,
        args.userEmail,
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
    return normalise(rows[0]!);
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
