import { KNOWN_INSTRUMENTS, type Charge, type Rule } from "@stampdraft/schema";
import { buildSnapshot, type RuleSet } from "./snapshot.js";

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
 *  2. Append-only integrity: versions of a rule_id must not overlap in     §6.1
 *     time; gaps are flagged as warnings.
 *  3. Cross-refs resolve WITHIN the referrer's active snapshot — never     §5.3
 *     across versions. Checked at the referrer's effective_from.
 *  4. Modifier references exist.
 *  5. Instrument is in the known MVP vocabulary (advisory warning).
 *
 * Returns every issue found. The CI gate fails the build on any `error`.
 */
export function validateRuleSet(ruleSet: RuleSet): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Citation presence (belt-and-braces).
  for (const r of ruleSet.rules) {
    if (!r.version.source?.ref || !r.version.source?.quoted_text) {
      issues.push({ level: "error", message: "active rule missing source citation", where: ruleKey(r) });
    }
    if (!KNOWN_INSTRUMENTS.includes(r.instrument as (typeof KNOWN_INSTRUMENTS)[number])) {
      issues.push({ level: "warning", message: `instrument "${r.instrument}" not in known MVP vocabulary`, where: ruleKey(r) });
    }
  }

  // 2. Append-only integrity per (jurisdiction, rule_id).
  const byId = new Map<string, Rule[]>();
  for (const r of ruleSet.rules) {
    const k = `${r.jurisdiction}::${r.rule_id}`;
    (byId.get(k) ?? byId.set(k, []).get(k)!).push(r);
  }
  for (const [k, versions] of byId) {
    const sorted = [...versions].sort((a, b) =>
      a.version.effective_from < b.version.effective_from ? -1 : a.version.effective_from > b.version.effective_from ? 1 : 0,
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i]!;
      const next = sorted[i + 1]!;
      const curTo = cur.version.effective_to;
      if (curTo === null) {
        issues.push({
          level: "error",
          message: `open-ended version (effective_to: null) is superseded by a later version starting ${next.version.effective_from} — supersession must close the predecessor`,
          where: k,
        });
      } else if (curTo > next.version.effective_from) {
        issues.push({ level: "error", message: `versions overlap: ${curTo} > ${next.version.effective_from}`, where: k });
      } else if (curTo < next.version.effective_from) {
        issues.push({ level: "warning", message: `gap between versions: ${curTo} … ${next.version.effective_from}`, where: k });
      }
    }
  }

  // 3 & 4. Cross-ref and modifier resolution within the referrer's snapshot.
  const modifierIds = new Set(ruleSet.modifiers.map((m) => `${m.jurisdiction}::${m.modifier_id}`));
  for (const r of ruleSet.rules) {
    const snapshot = buildSnapshot(ruleSet, r.jurisdiction, r.version.effective_from);
    for (const targetId of collectCrossRefs(r.charge)) {
      if (!snapshot.rulesById.has(targetId)) {
        issues.push({
          level: "error",
          message: `cross_ref target "${targetId}" is not active in the ${r.jurisdiction} snapshot on ${r.version.effective_from}`,
          where: ruleKey(r),
        });
      }
    }
    for (const modId of r.modifiers) {
      if (!modifierIds.has(`${r.jurisdiction}::${modId}`)) {
        issues.push({ level: "error", message: `modifier "${modId}" referenced but never defined`, where: ruleKey(r) });
      }
    }
  }

  return issues;
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
    return [...charge.cases.flatMap((c) => collectCrossRefs(c.charge)), ...collectCrossRefs(charge.default)];
  }
  return [];
}
