import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { canonicalJson, compute, loadStateDir } from "@stampdraft/engine";
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

beforeAll(async () => {
  db = await connect(undefined); // PGlite in-memory — real Postgres semantics
  await migrate(db);
  store = new Store(db);
  const firm = await store.ensureFirm("Test & Co.");
  firmId = firm.id;
  await store.addUser(firmId, "lawyer@test.in", "A Lawyer");
});

afterAll(async () => {
  await db.close();
});

describe("firm workspace (PRD Flow E)", () => {
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
});

describe("audit log (PRD §7)", () => {
  it("records a computation with its inputs and ruleset hash", async () => {
    const [matter] = await store.listMatters(firmId);
    const output = compute(dl.ruleSet, conveyance);

    const rec = await store.recordComputation({
      firmId, matterId: matter!.id, userEmail: "lawyer@test.in", output, engineVersion: ENGINE_VERSION,
    });

    expect(rec.total_duty).toBe(output.total_duty);
    expect(rec.rules_version).toBe(output.rules_version);
    expect(rec.input_values).toEqual(conveyance.values);
    expect(rec.input_facts).toEqual(conveyance.facts);
    expect(rec.extraction_model_version).toBeNull(); // Tier 1 — no model involved

    const matters = await store.listMatters(firmId);
    expect(matters[0]!.computation_count).toBe(1);
  });

  it("REPRODUCES the stored output from {inputs, hash} alone — the §7 claim", async () => {
    const recs = await store.listComputations(firmId);
    const rec = recs[0]!;

    // Recompute purely from what the audit retained; nothing else is needed.
    const replay = compute(dl.ruleSet, {
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

  it("a correction is a NEW record — the superseded one still stands", async () => {
    const [matter] = await store.listMatters(firmId);
    const corrected = compute(dl.ruleSet, { ...conveyance, facts: { transferee_category: "male" } });
    await store.recordComputation({
      firmId, matterId: matter!.id, userEmail: "lawyer@test.in", output: corrected, engineVersion: ENGINE_VERSION,
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
