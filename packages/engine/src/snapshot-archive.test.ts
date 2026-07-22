import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
  buildSnapshot,
  compute,
  computeFromSnapshotArchive,
  createSnapshotArchive,
  hashSnapshotArchive,
  loadStateDir,
  parseSnapshotArchive,
} from "./index.js";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const dl = loadStateDir(root("../../../rules/DL"));
const input = {
  jurisdiction: "DL" as const,
  rule_id: "DL-ART23-conveyance",
  execution_date: "2024-06-01",
  values: { consideration: "10000000", market_value: "10000000" },
  facts: { transferee_category: "female" },
};

describe("canonical snapshot archives", () => {
  it("preserves the existing rules_version identity", () => {
    const snapshot = buildSnapshot(dl.ruleSet, input.jurisdiction, input.execution_date);
    const archive = createSnapshotArchive(snapshot);

    expect(hashSnapshotArchive(archive)).toBe(snapshot.hash);
    expect(archive.rules.map((rule) => rule.rule_id)).toEqual(
      [...archive.rules.map((rule) => rule.rule_id)].sort(),
    );
  });

  it("normalises array order without changing the content hash", () => {
    const archive = createSnapshotArchive(buildSnapshot(dl.ruleSet, input.jurisdiction, input.execution_date));
    const reversed = { ...archive, rules: [...archive.rules].reverse() };

    expect(hashSnapshotArchive(reversed)).toBe(hashSnapshotArchive(archive));
    expect(parseSnapshotArchive(reversed).rules[0]!.rule_id).toBe(archive.rules[0]!.rule_id);
  });

  it("replays from the archive and refuses a mismatched expected hash", () => {
    const original = compute(dl.ruleSet, input);
    const archive = createSnapshotArchive(buildSnapshot(dl.ruleSet, input.jurisdiction, input.execution_date));

    expect(computeFromSnapshotArchive(archive, original.rules_version, input)).toEqual(original);
    expect(() => computeFromSnapshotArchive(archive, `sha256:${"0".repeat(64)}`, input)).toThrow(
      /snapshot archive hash mismatch/,
    );
  });

  it("refuses malformed, cross-jurisdiction, and duplicate payloads", () => {
    const archive = createSnapshotArchive(buildSnapshot(dl.ruleSet, input.jurisdiction, input.execution_date));
    expect(() => parseSnapshotArchive({ jurisdiction: "DL" })).toThrow(/invalid snapshot archive shape/);

    const crossJurisdiction = structuredClone(archive);
    crossJurisdiction.rules[0]!.jurisdiction = "MH";
    expect(() => parseSnapshotArchive(crossJurisdiction)).toThrow(/belongs to MH, not DL/);

    const duplicate = structuredClone(archive);
    duplicate.rules.push(duplicate.rules[0]!);
    expect(() => parseSnapshotArchive(duplicate)).toThrow(/duplicate rule id/);
  });
});
