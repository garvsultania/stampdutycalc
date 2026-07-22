import { createHash } from "node:crypto";
import {
  ChargingRulesSchema,
  JurisdictionSchema,
  ModifierSchema,
  PenaltyRegimeSchema,
  RuleSchema,
  type ChargingRules,
  type ISODate,
  type Jurisdiction,
  type Modifier,
  type PenaltyRegime,
  type Rule,
} from "@stampdraft/schema";
import { EngineError } from "./errors.js";

/**
 * A RuleSet is the full append-only corpus: every version of every rule, every
 * modifier, and per-state penalty regimes. Versions are never mutated; a later
 * version supersedes an earlier one (PRD §6.1).
 */
export interface RuleSet {
  rules: Rule[];
  modifiers: Modifier[];
  penaltyRegimes: PenaltyRegime[];
  /** Act-level general charging rules (s.4/s.5/s.6) — optional so existing
   * synthetic rulesets stay valid; required for the s.4 relief computation. */
  chargingRules?: ChargingRules[];
}

/**
 * A Snapshot is the set of versions ACTIVE on a given date in a given
 * jurisdiction. Cross-references resolve ONLY within a snapshot — a cross-ref
 * must never resolve across versions (PRD §5.3, §6.1). The snapshot hashes to
 * the `rules_version` recorded on every computation (PRD §7).
 */
export interface Snapshot {
  jurisdiction: Jurisdiction;
  date: ISODate;
  rulesById: Map<string, Rule>;
  modifiersById: Map<string, Modifier>;
  /** Active penalty regimes — part of the hashed identity: a Flow D output
   * depends on them, so {inputs, hash} must pin them too (PRD §7). */
  penaltyRegimesById: Map<string, PenaltyRegime>;
  /** Active general charging rules — hashed, since s.4/s.5/s.6 outputs depend on them. */
  chargingRulesById: Map<string, ChargingRules>;
  hash: string;
}

/**
 * The complete, serialisable legal state behind one `rules_version`. The shape
 * deliberately matches the payload historically hashed by `hashSnapshot`, so
 * adding durable archives does not change any existing snapshot identity.
 */
export interface SnapshotArchive {
  jurisdiction: Jurisdiction;
  rules: Rule[];
  modifiers: Modifier[];
  penalty_regimes: PenaltyRegime[];
  charging_rules: ChargingRules[];
}

/** Half-open [effective_from, effective_to) membership. Dates are ISO strings
 * comparable lexicographically. effective_to === null means "current". */
function isActiveOn(from: ISODate, to: ISODate | null, date: ISODate): boolean {
  return from <= date && (to === null || date < to);
}

function resolveLatestActive<T extends { version: { effective_from: ISODate; effective_to: ISODate | null } }>(
  versions: T[],
  date: ISODate,
  label = "versioned dependency",
): T | undefined {
  const active = versions.filter((v) => isActiveOn(v.version.effective_from, v.version.effective_to, date));
  if (active.length === 0) return undefined;
  if (active.length > 1) {
    throw new EngineError(
      `${label} has ${active.length} overlapping versions active on ${date}; refusing ambiguous law`,
    );
  }
  return active[0];
}

/**
 * Build the active snapshot for a jurisdiction on a date and compute its
 * deterministic `rules_version` hash. Identical active law ⇒ identical hash,
 * regardless of the date it is observed on (two dates with no intervening change
 * share a hash — correct: same law, same version).
 */
export function buildSnapshot(ruleSet: RuleSet, jurisdiction: Jurisdiction, date: ISODate): Snapshot {
  const rulesById = new Map<string, Rule>();
  const byRuleId = groupBy(
    ruleSet.rules.filter((r) => r.jurisdiction === jurisdiction),
    (r) => r.rule_id,
  );
  for (const [rid, versions] of byRuleId) {
    const active = resolveLatestActive(versions, date, `rule "${rid}"`);
    if (active) rulesById.set(rid, active);
  }

  const modifiersById = new Map<string, Modifier>();
  const byModId = groupBy(
    ruleSet.modifiers.filter((m) => m.jurisdiction === jurisdiction),
    (m) => m.modifier_id,
  );
  for (const [mid, versions] of byModId) {
    const active = resolveLatestActive(versions, date, `modifier "${mid}"`);
    if (active) modifiersById.set(mid, active);
  }

  const penaltyRegimesById = new Map<string, PenaltyRegime>();
  const byRegimeId = groupBy(
    ruleSet.penaltyRegimes.filter((p) => p.jurisdiction === jurisdiction),
    (p) => p.regime_id,
  );
  for (const [rid, versions] of byRegimeId) {
    const active = resolveLatestActive(versions, date, `penalty regime "${rid}"`);
    if (active) penaltyRegimesById.set(rid, active);
  }

  const chargingRulesById = new Map<string, ChargingRules>();
  const byChargingId = groupBy(
    (ruleSet.chargingRules ?? []).filter((c) => c.jurisdiction === jurisdiction),
    (c) => c.rules_id,
  );
  for (const [cid, versions] of byChargingId) {
    const active = resolveLatestActive(versions, date, `charging rules "${cid}"`);
    if (active) chargingRulesById.set(cid, active);
  }

  const hash = hashSnapshot(jurisdiction, rulesById, modifiersById, penaltyRegimesById, chargingRulesById);
  return { jurisdiction, date, rulesById, modifiersById, penaltyRegimesById, chargingRulesById, hash };
}

/** Resolve the penalty regime active on a date for a jurisdiction, or undefined.
 * If a regime_id is given, resolve that specific regime's version; otherwise the
 * single active regime for the state (append-only, so at most one). */
export function resolvePenaltyRegime(
  ruleSet: RuleSet,
  jurisdiction: Jurisdiction,
  date: ISODate,
  regimeId?: string,
): PenaltyRegime | undefined {
  const candidates = ruleSet.penaltyRegimes.filter(
    (p) => p.jurisdiction === jurisdiction && (regimeId === undefined || p.regime_id === regimeId),
  );
  return resolveLatestActive(candidates, date, regimeId ? `penalty regime "${regimeId}"` : `penalty regime for ${jurisdiction}`);
}

/** Resolve the general charging rules (s.4/s.5/s.6) active on a date, or throw. */
export function resolveChargingRules(ruleSet: RuleSet, jurisdiction: Jurisdiction, date: ISODate): ChargingRules {
  const candidates = (ruleSet.chargingRules ?? []).filter((c) => c.jurisdiction === jurisdiction);
  const active = resolveLatestActive(candidates, date, `charging rules for ${jurisdiction}`);
  if (!active) {
    throw new EngineError(`no general charging rules (s.4/s.5/s.6) encoded for ${jurisdiction} on ${date}`);
  }
  return active;
}

/** Resolve one rule version active on a date, or throw if none. */
export function resolveRule(ruleSet: RuleSet, jurisdiction: Jurisdiction, ruleId: string, date: ISODate): Rule {
  const versions = ruleSet.rules.filter((r) => r.jurisdiction === jurisdiction && r.rule_id === ruleId);
  if (versions.length === 0) {
    throw new EngineError(`no rule "${ruleId}" for jurisdiction ${jurisdiction}`);
  }
  const active = resolveLatestActive(versions, date, `rule "${ruleId}"`);
  if (!active) {
    throw new EngineError(`rule "${ruleId}" has no version effective on ${date}`);
  }
  return active;
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/**
 * Deterministic snapshot hash: SHA-256 over a canonical (recursively key-sorted)
 * JSON serialisation of the active rules and modifiers. This is the liability
 * shield — every output ties back to an exact ruleset identity (PRD §7, §14 Pass2.8).
 */
export function hashSnapshot(
  jurisdiction: Jurisdiction,
  rulesById: Map<string, Rule>,
  modifiersById: Map<string, Modifier>,
  penaltyRegimesById: Map<string, PenaltyRegime> = new Map(),
  chargingRulesById: Map<string, ChargingRules> = new Map(),
): string {
  return hashSnapshotArchive({
    jurisdiction,
    rules: [...rulesById.keys()].sort().map((k) => rulesById.get(k)),
    modifiers: [...modifiersById.keys()].sort().map((k) => modifiersById.get(k)),
    // Penalty regimes are part of the ruleset identity: a Flow D output changes
    // when they change, so the hash must change too, or {inputs, hash} would not
    // reproduce the output byte-for-byte (PRD §7).
    penalty_regimes: [...penaltyRegimesById.keys()].sort().map((k) => penaltyRegimesById.get(k)),
    charging_rules: [...chargingRulesById.keys()].sort().map((k) => chargingRulesById.get(k)),
  });
}

/** Build the canonical archive payload for a previously resolved snapshot. */
export function createSnapshotArchive(snapshot: Snapshot): SnapshotArchive {
  return parseSnapshotArchive({
    jurisdiction: snapshot.jurisdiction,
    rules: [...snapshot.rulesById.values()],
    modifiers: [...snapshot.modifiersById.values()],
    penalty_regimes: [...snapshot.penaltyRegimesById.values()],
    charging_rules: [...snapshot.chargingRulesById.values()],
  });
}

/** Parse, validate, and deterministically order an untrusted archive payload. */
export function parseSnapshotArchive(value: unknown): SnapshotArchive {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EngineError("invalid snapshot archive: expected an object");
  }

  const record = value as Record<string, unknown>;
  const expectedKeys = ["charging_rules", "jurisdiction", "modifiers", "penalty_regimes", "rules"];
  const actualKeys = Object.keys(record).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new EngineError(`invalid snapshot archive shape: expected only ${expectedKeys.join(", ")}`);
  }

  try {
    const archive: SnapshotArchive = {
      jurisdiction: JurisdictionSchema.parse(record.jurisdiction),
      rules: RuleSchema.array().parse(record.rules),
      modifiers: ModifierSchema.array().parse(record.modifiers),
      penalty_regimes: PenaltyRegimeSchema.array().parse(record.penalty_regimes),
      charging_rules: ChargingRulesSchema.array().parse(record.charging_rules),
    };

    assertArchiveJurisdiction(archive);
    assertUniqueArchiveIds(archive);
    archive.rules.sort((left, right) => compareIds(left.rule_id, right.rule_id));
    archive.modifiers.sort((left, right) => compareIds(left.modifier_id, right.modifier_id));
    archive.penalty_regimes.sort((left, right) => compareIds(left.regime_id, right.regime_id));
    archive.charging_rules.sort((left, right) => compareIds(left.rules_id, right.rules_id));
    return archive;
  } catch (error) {
    if (error instanceof EngineError) throw error;
    throw new EngineError(`invalid snapshot archive: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Recompute the identity of an archive instead of trusting its storage key. */
export function hashSnapshotArchive(value: unknown): string {
  const archive = parseSnapshotArchive(value);
  return "sha256:" + createHash("sha256").update(canonicalJson(archive)).digest("hex");
}

/**
 * Restore an isolated RuleSet after checking the archive against the audit key.
 * No live corpus object is accepted or consulted on this path.
 */
export function ruleSetFromSnapshotArchive(value: unknown, expectedRulesVersion: string): RuleSet {
  const archive = parseSnapshotArchive(value);
  const actualRulesVersion = hashSnapshotArchive(archive);
  if (actualRulesVersion !== expectedRulesVersion) {
    throw new EngineError(
      `snapshot archive hash mismatch: expected ${expectedRulesVersion}, recomputed ${actualRulesVersion}`,
    );
  }
  return {
    rules: archive.rules,
    modifiers: archive.modifiers,
    penaltyRegimes: archive.penalty_regimes,
    chargingRules: archive.charging_rules,
  };
}

function assertArchiveJurisdiction(archive: SnapshotArchive): void {
  const mismatches = [
    ...archive.rules.map((item) => ["rule", item.rule_id, item.jurisdiction] as const),
    ...archive.modifiers.map((item) => ["modifier", item.modifier_id, item.jurisdiction] as const),
    ...archive.penalty_regimes.map((item) => ["penalty regime", item.regime_id, item.jurisdiction] as const),
    ...archive.charging_rules.map((item) => ["charging rules", item.rules_id, item.jurisdiction] as const),
  ].filter(([, , jurisdiction]) => jurisdiction !== archive.jurisdiction);
  if (mismatches.length > 0) {
    const [kind, id, jurisdiction] = mismatches[0]!;
    throw new EngineError(
      `invalid snapshot archive: ${kind} "${id}" belongs to ${jurisdiction}, not ${archive.jurisdiction}`,
    );
  }
}

function assertUniqueArchiveIds(archive: SnapshotArchive): void {
  assertUniqueIds("rule", archive.rules.map((item) => item.rule_id));
  assertUniqueIds("modifier", archive.modifiers.map((item) => item.modifier_id));
  assertUniqueIds("penalty regime", archive.penalty_regimes.map((item) => item.regime_id));
  assertUniqueIds("charging rules", archive.charging_rules.map((item) => item.rules_id));
}

function assertUniqueIds(label: string, ids: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new EngineError(`invalid snapshot archive: duplicate ${label} id "${id}"`);
    seen.add(id);
  }
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Stable JSON: object keys sorted recursively so serialisation is canonical. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}
