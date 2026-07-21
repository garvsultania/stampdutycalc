import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  buildSnapshot,
  canonicalJson,
  compute,
  computeFromSnapshotArchive,
  createSnapshotArchive,
  loadStateDir,
} from "@stampdraft/engine";
import { connect, migrate, Store, type Db } from "./index.js";

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const dl = loadStateDir(root("../../../rules/DL"));

let db: Db;
let store: Store;
let firmId: string;

const ENGINE_VERSION = "test-0.0.0";

const conveyance = {
  jurisdiction: "DL" as const,
  rule_id: "DL-ART23-conveyance",
  execution_date: "2024-06-01",
  values: { consideration: "10000000", market_value: "10000000" },
  facts: { transferee_category: "female" },
};

function conveyanceSnapshot() {
  return createSnapshotArchive(buildSnapshot(dl.ruleSet, conveyance.jurisdiction, conveyance.execution_date));
}

beforeAll(async () => {
  db = await connect(undefined); // PGlite in-memory — real Postgres semantics
  await migrate(db);
  store = new Store(db);
  const firm = await store.ensureFirm("Test & Co.");
  firmId = firm.id;
  await store.addUser(firmId, "lawyer@test.in", "A Lawyer", {
    issuer: "https://identity.test",
    subject: "lawyer-1",
  });
});

afterAll(async () => {
  await db.close();
});

describe("firm workspace (PRD Flow E)", () => {
  it("resolves a stable provider-neutral identity only inside its firm membership", async () => {
    await expect(store.getFirmUserByIdentity(firmId, "https://identity.test", "lawyer-1")).resolves.toMatchObject({
      firm_id: firmId,
      email: "lawyer@test.in",
    });
    await expect(store.getFirmUserByIdentity(randomUUID(), "https://identity.test", "lawyer-1")).resolves.toBeNull();
  });

  it("upgrades a legacy email membership to a stable external identity", async () => {
    const legacyFirm = await store.createFirm("Legacy Firm");
    await store.addUser(legacyFirm.id, "legacy@test.in", "Legacy User");
    await store.addUser(legacyFirm.id, "legacy@test.in", "Legacy User", {
      issuer: "https://identity.test",
      subject: "legacy-lawyer",
    });
    await expect(
      store.getFirmUserByIdentity(legacyFirm.id, "https://identity.test", "legacy-lawyer"),
    ).resolves.toMatchObject({ email: "legacy@test.in" });
  });

  it("creates matters and lists them with computation counts", async () => {
    const m = await store.createMatter({
      firmId, reference: "M-2024-001", title: "Acme HQ purchase", client: "Acme Ltd", createdBy: "lawyer@test.in",
    });
    expect(m.reference).toBe("M-2024-001");

    const matters = await store.listMatters(firmId);
    expect(matters).toHaveLength(1);
    expect(matters[0]!.computation_count).toBe(0);
  });

  it("enforces one reference per firm", async () => {
    await expect(
      store.createMatter({ firmId, reference: "M-2024-001", title: "Duplicate", createdBy: "lawyer@test.in" }),
    ).rejects.toThrow();
  });

  it("refuses a creator who is not a member of the target firm", async () => {
    await expect(store.createMatter({
      firmId,
      reference: "M-UNAUTHORIZED",
      title: "Must not be created",
      createdBy: "outsider@test.in",
    })).rejects.toThrow(/not a member/);

    await expect(db.query(
      `INSERT INTO matter (id, firm_id, reference, title, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), firmId, "M-DIRECT-UNAUTHORIZED", "Must not be inserted", "outsider@test.in"],
    )).rejects.toThrow(/foreign key/i);
  });
});

describe("audit log (PRD §7)", () => {
  it("records a computation with its inputs and ruleset hash", async () => {
    const [matter] = await store.listMatters(firmId);
    const output = compute(dl.ruleSet, conveyance);

    const rec = await store.recordComputation({
      firmId,
      matterId: matter!.id,
      userEmail: "lawyer@test.in",
      output,
      snapshotArchive: conveyanceSnapshot(),
      engineVersion: ENGINE_VERSION,
    });

    expect(rec.total_duty).toBe(output.total_duty);
    expect(rec.rules_version).toBe(output.rules_version);
    expect(rec.input_values).toEqual(conveyance.values);
    expect(rec.input_facts).toEqual(conveyance.facts);
    expect(rec.extraction_model_version).toBeNull(); // Tier 1 — no model involved
    expect((await store.getSnapshotArchive(rec.rules_version))?.payload.jurisdiction).toBe("DL");

    const matters = await store.listMatters(firmId);
    expect(matters[0]!.computation_count).toBe(1);
  });

  it("uses an explicit Tier 2 record id as an idempotency key", async () => {
    const output = compute(dl.ruleSet, conveyance);
    const recordId = randomUUID();
    const args = {
      firmId,
      userEmail: "lawyer@test.in",
      output,
      snapshotArchive: conveyanceSnapshot(),
      engineVersion: ENGINE_VERSION,
      extractionModelVersion: "extractor-v1",
      recordId,
    };
    const first = await store.recordComputation(args);
    const second = await store.recordComputation(args);
    expect(second).toEqual(first);
    expect((await store.listComputations(firmId)).filter((record) => record.id === recordId)).toHaveLength(1);

    await expect(store.recordComputation({ ...args, engineVersion: "different-engine" }))
      .rejects.toThrow(/idempotency key conflicts/);
  });

  it("REPRODUCES from the archive after the live corpus changes — the §7 claim", async () => {
    const recs = await store.listComputations(firmId);
    const rec = recs[0]!;
    const archived = await store.getSnapshotArchive(rec.rules_version);
    expect(archived).not.toBeNull();

    const changedRuleSet = structuredClone(dl.ruleSet);
    const changedRule = changedRuleSet.rules.find((rule) => rule.rule_id === conveyance.rule_id);
    if (!changedRule || changedRule.charge.kind !== "ad_valorem" || typeof changedRule.charge.pct === "number") {
      throw new Error("test fixture no longer has the expected category-selected ad valorem charge");
    }
    changedRule.charge.pct.cases[0]!.pct = 9;
    const changedLiveOutput = compute(changedRuleSet, conveyance);
    expect(changedLiveOutput.rules_version).not.toBe(rec.rules_version);
    expect(changedLiveOutput.total_duty).not.toBe(rec.total_duty);

    const replay = computeFromSnapshotArchive(archived!.payload, rec.rules_version, {
      jurisdiction: rec.jurisdiction as "DL",
      rule_id: rec.rule_id,
      execution_date: rec.execution_date,
      values: rec.input_values as Record<string, string>,
      facts: rec.input_facts as Record<string, string>,
    });

    expect(replay.rules_version).toBe(rec.rules_version); // same law
    expect(replay.total_duty).toBe(rec.total_duty); // same number

    // Compared on the CANONICAL form, not raw JSON.stringify. The stored inputs
    // round-trip through jsonb, which reorders object keys (market_value sorts
    // before consideration), so the replayed input object has a different key
    // ORDER while every value is identical. Determinism is a claim about values,
    // not about key order — canonicalJson (recursively key-sorted) is the form the
    // engine already hashes, so it is the right basis for the comparison.
    expect(canonicalJson(replay)).toBe(canonicalJson(rec.output));
  });

  it("REFUSES a snapshot whose recomputed hash does not match its storage key", async () => {
    const payload = canonicalJson(conveyanceSnapshot());
    const falseHash = `sha256:${"0".repeat(64)}`;
    await db.query(
      `INSERT INTO rules_snapshot_archive (rules_version, jurisdiction, payload)
       VALUES ($1, $2, $3)`,
      [falseHash, "DL", payload],
    );
    await expect(store.getSnapshotArchive(falseHash)).rejects.toThrow(/hash mismatch/);
  });

  it("REFUSES malformed and missing snapshot archives", async () => {
    const malformedHash = `sha256:${"1".repeat(64)}`;
    await db.query(
      `INSERT INTO rules_snapshot_archive (rules_version, jurisdiction, payload)
       VALUES ($1, $2, $3)`,
      [malformedHash, "DL", "{not-json"],
    );
    await expect(store.getSnapshotArchive(malformedHash)).rejects.toThrow(/malformed/);
    await expect(store.getSnapshotArchive(`sha256:${"2".repeat(64)}`)).resolves.toBeNull();
  });

  it("REFUSES recording when the output points to a different snapshot", async () => {
    const output = compute(dl.ruleSet, conveyance);
    const differentSnapshot = structuredClone(conveyanceSnapshot());
    differentSnapshot.rules[0]!.notes_for_reviewer += " changed archive";
    await expect(store.recordComputation({
      firmId,
      userEmail: "lawyer@test.in",
      output,
      snapshotArchive: differentSnapshot,
      engineVersion: ENGINE_VERSION,
    })).rejects.toThrow(/does not match snapshot archive/);
  });

  it("REFUSES cross-firm computation-to-matter references in the repository and database", async () => {
    const otherFirm = await store.createFirm("Other Firm");
    await store.addUser(otherFirm.id, "other@test.in", "Other Lawyer", {
      issuer: "https://identity.test",
      subject: "other-lawyer",
    });
    const otherMatter = await store.createMatter({
      firmId: otherFirm.id,
      reference: "OTHER-001",
      title: "Other firm's matter",
      createdBy: "other@test.in",
    });
    const output = compute(dl.ruleSet, conveyance);

    await expect(store.recordComputation({
      firmId,
      matterId: otherMatter.id,
      userEmail: "lawyer@test.in",
      output,
      snapshotArchive: conveyanceSnapshot(),
      engineVersion: ENGINE_VERSION,
    })).rejects.toThrow(/matter does not belong/);

    const [existing] = await store.listComputations(firmId);
    await expect(db.query(
      `INSERT INTO computation_audit (
         id, firm_id, matter_id, user_email, jurisdiction, rule_id, execution_date,
         input_values, input_facts, duty_paid, penalty_months, rules_version,
         engine_version, extraction_model_version, total_duty, output
       )
       SELECT $1, firm_id, $2, user_email, jurisdiction, rule_id, execution_date,
              input_values, input_facts, duty_paid, penalty_months, rules_version,
              engine_version, extraction_model_version, total_duty, output
         FROM computation_audit WHERE id = $3`,
      [randomUUID(), otherMatter.id, existing!.id],
    )).rejects.toThrow(/foreign key/i);
  });

  it("REFUSES an audit author who is not a firm member", async () => {
    const output = compute(dl.ruleSet, conveyance);
    await expect(store.recordComputation({
      firmId,
      userEmail: "outsider@test.in",
      output,
      snapshotArchive: conveyanceSnapshot(),
      engineVersion: ENGINE_VERSION,
    })).rejects.toThrow(/not a member/);
  });

  it("REFUSES an audit insert before its snapshot archive exists", async () => {
    const recs = await store.listComputations(firmId);
    const missingHash = `sha256:${"3".repeat(64)}`;
    await expect(db.query(
      `INSERT INTO computation_audit (
         id, firm_id, matter_id, user_email, jurisdiction, rule_id, execution_date,
         input_values, input_facts, duty_paid, penalty_months, rules_version,
         engine_version, extraction_model_version, total_duty, output
       )
       SELECT $1, firm_id, matter_id, user_email, jurisdiction, rule_id, execution_date,
              input_values, input_facts, duty_paid, penalty_months, $2,
              engine_version, extraction_model_version, total_duty, output
         FROM computation_audit WHERE id = $3`,
      [randomUUID(), missingHash, recs[0]!.id],
    )).rejects.toThrow(/snapshot archive .* must exist/);
  });

  it("REFUSES updates at the database level, not by convention", async () => {
    const recs = await store.listComputations(firmId);
    await expect(
      db.query("UPDATE computation_audit SET total_duty = $1 WHERE id = $2", ["1", recs[0]!.id]),
    ).rejects.toThrow(/append-only/);
  });

  it("REFUSES deletes at the database level", async () => {
    const recs = await store.listComputations(firmId);
    await expect(db.query("DELETE FROM computation_audit WHERE id = $1", [recs[0]!.id])).rejects.toThrow(
      /append-only/,
    );
  });

  it("REFUSES snapshot archive updates and deletes at the database level", async () => {
    const recs = await store.listComputations(firmId);
    await expect(
      db.query("UPDATE rules_snapshot_archive SET jurisdiction = $1 WHERE rules_version = $2", ["MH", recs[0]!.rules_version]),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.query("DELETE FROM rules_snapshot_archive WHERE rules_version = $1", [recs[0]!.rules_version]),
    ).rejects.toThrow(/append-only/);
  });

  it("a correction is a NEW record — the superseded one still stands", async () => {
    const [matter] = await store.listMatters(firmId);
    const corrected = compute(dl.ruleSet, { ...conveyance, facts: { transferee_category: "male" } });
    await store.recordComputation({
      firmId,
      matterId: matter!.id,
      userEmail: "lawyer@test.in",
      output: corrected,
      snapshotArchive: conveyanceSnapshot(),
      engineVersion: ENGINE_VERSION,
    });

    const recs = await store.listComputations(firmId, matter!.id);
    expect(recs).toHaveLength(2);
    // Both readings survive: what was relied upon, and what replaced it.
    expect(recs.map((r) => r.total_duty).sort()).toEqual(["500000", "700000"]);
  });

  it("stores NO document snippets — retention amendment A1", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'computation_audit'",
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain("input_values"); // confirmed values persist
    expect(cols).toContain("rules_version");
    expect(cols.some((c) => /snippet|excerpt|document_text/.test(c))).toBe(false);
  });
});

describe("API keys (PRD Flow E)", () => {
  it("issues a key, stores only its hash, and resolves it back to the firm", async () => {
    const { key, id } = await store.createApiKey(firmId, "CI pipeline");
    expect(key).toMatch(/^sd_[0-9a-f]{32}$/);

    const { rows } = await db.query<{ key_hash: string }>("SELECT key_hash FROM api_key WHERE id = $1", [id]);
    expect(rows[0]!.key_hash).not.toBe(key); // plaintext is never persisted

    expect(await store.resolveApiKey(key)).toMatchObject({ firm_id: firmId });
    expect(await store.resolveApiKey("sd_wrong")).toBeNull();
  });

  it("stops resolving once revoked", async () => {
    const { key, id } = await store.createApiKey(firmId, "Temp");
    expect(await store.resolveApiKey(key)).not.toBeNull();
    await store.revokeApiKey(firmId, id);
    expect(await store.resolveApiKey(key)).toBeNull();
  });
});
