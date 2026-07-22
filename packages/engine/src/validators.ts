import {
  KNOWN_INSTRUMENTS,
  type Charge,
  type ClassificationTree,
  type ModifierReference,
  type Rule,
} from "@stampdraft/schema";
import type { RuleSet } from "./snapshot.js";

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
  where: string;
}

/**
 * Ruleset-level structural validation, enforcing the invariants the per-object
 * Zod schemas cannot (they see one object at a time):
 *
 *  1. Citation presence (defence-in-depth; Zod already requires it).      law #4
 *  2. Append-only integrity for every versioned corpus family: rules,
 *     modifiers, penalties, charging rules, and classification trees.      §6.1
 *  3. Cross-refs resolve throughout the referrer's full effective interval,
 *     never only at the first day.                                           §5.3
 *  4. Modifier references are active throughout their explicit required
 *     interval. Missing availability is an undercharging risk, not an opt-out.
 *  5. Instrument is in the known MVP vocabulary (advisory warning).
 *  6. Classification-tree terminals resolve to a rule active in the tree's       §6.2
 *     own snapshot — a terminal pointing at a typo'd/absent rule_id would
 *     otherwise only fail at runtime, in front of a user.
 *  7. cap >= min_duty where both are declared.
 *  8. MVP rules carry an identity-matched input contract that covers the full
 *     rule era. Loader attachment is not trusted as the only enforcement point.
 *
 * Returns every issue found. The CI gate fails the build on any `error`.
 */
export function validateRuleSet(ruleSet: RuleSet, trees: ClassificationTree[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Citation presence (belt-and-braces).
  for (const r of ruleSet.rules) {
    if (!r.version.source?.ref || !r.version.source?.quoted_text) {
      issues.push({ level: "error", message: "active rule missing source citation", where: ruleKey(r) });
    }
    if (!KNOWN_INSTRUMENTS.includes(r.instrument as (typeof KNOWN_INSTRUMENTS)[number])) {
      issues.push({ level: "warning", message: `instrument "${r.instrument}" not in known MVP vocabulary`, where: ruleKey(r) });
    }
    validateInputContract(r, issues);
  }

  // 2. Append-only integrity across every versioned corpus family.
  validateVersionFamily(ruleSet.rules, "rule", (item) => item.rule_id, issues);
  validateVersionFamily(ruleSet.modifiers, "modifier", (item) => item.modifier_id, issues);
  validateVersionFamily(ruleSet.penaltyRegimes, "penalty regime", (item) => item.regime_id, issues);
  validateVersionFamily(ruleSet.chargingRules ?? [], "charging rules", (item) => item.rules_id, issues);
  validateVersionFamily(trees, "classification tree", (item) => item.tree_id, issues);

  // 3 & 4. Cross-ref and modifier coverage throughout the referrer's interval.
  const rulesById = groupVersioned(ruleSet.rules, (item) => item.rule_id);
  const modifiersById = groupVersioned(ruleSet.modifiers, (item) => item.modifier_id);
  for (const r of ruleSet.rules) {
    for (const targetId of collectCrossRefs(r.charge)) {
      const targetVersions = rulesById.get(`${r.jurisdiction}::${targetId}`) ?? [];
      if (!coversInterval(targetVersions, r.version.effective_from, r.version.effective_to)) {
        issues.push({
          level: "error",
          message: `cross_ref target "${targetId}" is not active throughout ` +
            `${formatInterval(r.version.effective_from, r.version.effective_to)}`,
          where: ruleKey(r),
        });
      }
    }
    for (const reference of r.modifiers) {
      const modId = modifierReferenceId(reference);
      const interval = modifierRequiredInterval(reference, r);
      if (!interval) {
        issues.push({
          level: "error",
          message: `modifier "${modId}" has a required interval outside the rule version`,
          where: ruleKey(r),
        });
        continue;
      }
      const versions = modifiersById.get(`${r.jurisdiction}::${modId}`) ?? [];
      if (!coversInterval(versions, interval.from, interval.to)) {
        issues.push({
          level: "error",
          message: versions.length === 0
            ? `modifier "${modId}" referenced but never defined`
            : `modifier "${modId}" is not active throughout required interval ${formatInterval(interval.from, interval.to)}`,
          where: ruleKey(r),
        });
      }
    }
    for (const bad of clampIssues(r.charge)) {
      issues.push({ level: "error", message: bad, where: ruleKey(r) });
    }
  }

  // 6. Classification-tree terminals must resolve throughout the tree version.
  for (const tree of trees) {
    for (const [nodeId, node] of Object.entries(tree.nodes)) {
      if (node.type !== "terminal") continue;
      const targetVersions = rulesById.get(`${tree.jurisdiction}::${node.rule_id}`) ?? [];
      if (!coversInterval(targetVersions, tree.version.effective_from, tree.version.effective_to)) {
        issues.push({
          level: "error",
          message: `terminal "${nodeId}" points to rule_id "${node.rule_id}", which is not active throughout ` +
            `${formatInterval(tree.version.effective_from, tree.version.effective_to)}`,
          where: `${tree.jurisdiction}::${tree.tree_id}`,
        });
      }
    }
  }

  return issues;
}

function validateInputContract(rule: Rule, issues: ValidationIssue[]): void {
  const contract = rule.input_contract;
  if (!contract) {
    if (/^(DL|MH|KA)-/.test(rule.rule_id)) {
      issues.push({
        level: "error",
        message: "MVP rule is missing its per-rule input contract",
        where: ruleKey(rule),
      });
    }
    return;
  }
  if (contract.jurisdiction !== rule.jurisdiction || contract.rule_id !== rule.rule_id) {
    issues.push({
      level: "error",
      message: `input contract identity ${contract.jurisdiction}::${contract.rule_id} does not match its rule`,
      where: ruleKey(rule),
    });
  }
  if (
    contract.effective_from > rule.version.effective_from ||
    (contract.effective_to !== null &&
      (rule.version.effective_to === null || contract.effective_to < rule.version.effective_to))
  ) {
    issues.push({
      level: "error",
      message: `input contract is not active throughout ${formatInterval(rule.version.effective_from, rule.version.effective_to)}`,
      where: ruleKey(rule),
    });
  }
}

type Versioned = {
  jurisdiction: string;
  version: { effective_from: string; effective_to: string | null };
};

function validateVersionFamily<T extends Versioned>(
  items: readonly T[],
  kind: string,
  id: (item: T) => string,
  issues: ValidationIssue[],
): void {
  const grouped = groupVersioned(items, id);
  for (const [key, versions] of grouped) {
    const sorted = [...versions].sort((a, b) => a.version.effective_from.localeCompare(b.version.effective_from));
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i]!;
      const next = sorted[i + 1]!;
      const currentTo = current.version.effective_to;
      const where = `${kind} ${key}`;
      if (currentTo === null) {
        issues.push({
          level: "error",
          message: `open-ended version (effective_to: null) is superseded by a later version starting ${next.version.effective_from} — supersession must close the predecessor`,
          where,
        });
      } else if (currentTo > next.version.effective_from) {
        issues.push({ level: "error", message: `versions overlap: ${currentTo} > ${next.version.effective_from}`, where });
      } else if (currentTo < next.version.effective_from) {
        issues.push({ level: "warning", message: `gap between versions: ${currentTo} … ${next.version.effective_from}`, where });
      }
    }
  }
}

function groupVersioned<T extends Versioned>(items: readonly T[], id: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = `${item.jurisdiction}::${id(item)}`;
    const versions = grouped.get(key);
    if (versions) versions.push(item);
    else grouped.set(key, [item]);
  }
  return grouped;
}

function coversInterval(versions: readonly Versioned[], from: string, to: string | null): boolean {
  let cursor: string | null = from;
  const sorted = [...versions].sort((a, b) => a.version.effective_from.localeCompare(b.version.effective_from));
  for (const candidate of sorted) {
    if (cursor === null) return true;
    const candidateTo = candidate.version.effective_to;
    if (candidateTo !== null && candidateTo <= cursor) continue;
    if (candidate.version.effective_from > cursor) return false;
    if (candidateTo === null) return true;
    if (candidateTo > cursor) cursor = candidateTo;
    if (to !== null && cursor >= to) return true;
  }
  return to !== null && cursor !== null && cursor >= to;
}

function modifierReferenceId(reference: ModifierReference): string {
  return typeof reference === "string" ? reference : reference.modifier_id;
}

function modifierRequiredInterval(
  reference: ModifierReference,
  rule: Rule,
): { from: string; to: string | null } | null {
  const from = typeof reference === "string"
    ? rule.version.effective_from
    : maxDate(rule.version.effective_from, reference.required_from ?? rule.version.effective_from);
  const to = typeof reference === "string"
    ? rule.version.effective_to
    : minEnd(rule.version.effective_to, reference.required_to ?? null);
  if (to !== null && to <= from) return null;
  return { from, to };
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

function minEnd(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a <= b ? a : b;
}

function formatInterval(from: string, to: string | null): string {
  return `[${from}, ${to ?? "∞"})`;
}

/** 7. Recursively flag a cap below its own min_duty (an unsatisfiable clamp). */
function clampIssues(charge: Charge): string[] {
  const out: string[] = [];
  if (charge.kind === "ad_valorem" || charge.kind === "slab") {
    if (charge.min_duty !== undefined && charge.cap !== undefined && Number(charge.cap) < Number(charge.min_duty)) {
      out.push(`cap (${charge.cap}) is below min_duty (${charge.min_duty}) — the clamp is unsatisfiable`);
    }
  }
  if (charge.kind === "formula") out.push(...charge.components.flatMap(clampIssues));
  if (charge.kind === "switch") out.push(...charge.cases.flatMap((c) => clampIssues(c.charge)));
  if (charge.kind === "select") {
    out.push(...charge.cases.flatMap((c) => clampIssues(c.charge)));
    const dflt = charge.default;
    if (dflt) out.push(...clampIssues(dflt));
  }
  return out;
}

function ruleKey(r: Rule): string {
  return `${r.jurisdiction}::${r.rule_id}@${r.version.effective_from}`;
}

/** Recursively collect all cross_ref target rule_ids within a charge. */
export function collectCrossRefs(charge: Charge): string[] {
  if (charge.kind === "cross_ref") return [charge.rule_id];
  if (charge.kind === "formula") return charge.components.flatMap(collectCrossRefs);
  if (charge.kind === "switch") return charge.cases.flatMap((c) => collectCrossRefs(c.charge));
  if (charge.kind === "select") {
    const dflt = charge.default;
    return [
      ...charge.cases.flatMap((c) => collectCrossRefs(c.charge)),
      ...(dflt ? collectCrossRefs(dflt) : []),
    ];
  }
  return [];
}
