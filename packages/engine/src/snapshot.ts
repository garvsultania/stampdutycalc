import { createHash } from "node:crypto";
import type { ChargingRules, ISODate, Jurisdiction, Modifier, PenaltyRegime, Rule } from "@stampdraft/schema";
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

/** Half-open [effective_from, effective_to) membership. Dates are ISO strings
 * comparable lexicographically. effective_to === null means "current". */
function isActiveOn(from: ISODate, to: ISODate | null, date: ISODate): boolean {
  return from <= date && (to === null || date < to);
}

function resolveLatestActive<T extends { version: { effective_from: ISODate; effective_to: ISODate | null } }>(
  versions: T[],
  date: ISODate,
): T | undefined {
  const active = versions.filter((v) => isActiveOn(v.version.effective_from, v.version.effective_to, date));
  if (active.length === 0) return undefined;
  // With a well-formed append-only set there is exactly one; if the data
  // overlaps (a bug the validator catches), pick the one that started latest so
  // resolution is at least deterministic.
  return active.reduce((a, b) => (b.version.effective_from > a.version.effective_from ? b : a));
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
    const active = resolveLatestActive(versions, date);
    if (active) rulesById.set(rid, active);
  }

  const modifiersById = new Map<string, Modifier>();
  const byModId = groupBy(
    ruleSet.modifiers.filter((m) => m.jurisdiction === jurisdiction),
    (m) => m.modifier_id,
  );
  for (const [mid, versions] of byModId) {
    const active = resolveLatestActive(versions, date);
    if (active) modifiersById.set(mid, active);
  }

  const penaltyRegimesById = new Map<string, PenaltyRegime>();
  const byRegimeId = groupBy(
    ruleSet.penaltyRegimes.filter((p) => p.jurisdiction === jurisdiction),
    (p) => p.regime_id,
  );
  for (const [rid, versions] of byRegimeId) {
    const active = resolveLatestActive(versions, date);
    if (active) penaltyRegimesById.set(rid, active);
  }

  const chargingRulesById = new Map<string, ChargingRules>();
  const byChargingId = groupBy(
    (ruleSet.chargingRules ?? []).filter((c) => c.jurisdiction === jurisdiction),
    (c) => c.rules_id,
  );
  for (const [cid, versions] of byChargingId) {
    const active = resolveLatestActive(versions, date);
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
  return resolveLatestActive(candidates, date);
}

/** Resolve the general charging rules (s.4/s.5/s.6) active on a date, or throw. */
export function resolveChargingRules(ruleSet: RuleSet, jurisdiction: Jurisdiction, date: ISODate): ChargingRules {
  const candidates = (ruleSet.chargingRules ?? []).filter((c) => c.jurisdiction === jurisdiction);
  const active = resolveLatestActive(candidates, date);
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
  const active = resolveLatestActive(versions, date);
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
  const payload = {
    jurisdiction,
    rules: [...rulesById.keys()].sort().map((k) => rulesById.get(k)),
    modifiers: [...modifiersById.keys()].sort().map((k) => modifiersById.get(k)),
    // Penalty regimes are part of the ruleset identity: a Flow D output changes
    // when they change, so the hash must change too, or {inputs, hash} would not
    // reproduce the output byte-for-byte (PRD §7).
    penalty_regimes: [...penaltyRegimesById.keys()].sort().map((k) => penaltyRegimesById.get(k)),
    charging_rules: [...chargingRulesById.keys()].sort().map((k) => chargingRulesById.get(k)),
  };
  return "sha256:" + createHash("sha256").update(canonicalJson(payload)).digest("hex");
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
