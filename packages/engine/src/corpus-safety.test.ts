import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import type { ClassificationTree } from "@stampdraft/schema";
import { classify, loadStateDir, mergeLoads } from "./index.js";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const corpus = mergeLoads([
  loadStateDir(root("../../../rules/DL")),
  loadStateDir(root("../../../rules/MH")),
  loadStateDir(root("../../../rules/KA")),
]);

function tree(id: string): ClassificationTree {
  const found = corpus.trees.find((candidate) => candidate.tree_id === id);
  if (!found) throw new Error(`missing classification tree ${id}`);
  return found;
}

describe("corpus classification refusal gates", () => {
  it("allows the Delhi lease branch but refuses the unproved leave-and-licence terminal", () => {
    const leaseTree = tree("DL-lease-vs-leave-license");
    expect(
      classify(
        leaseTree,
        { q_exclusive_possession: "yes", q_interest: "yes" },
        { executionDate: "2024-06-01" },
      ),
    ).toMatchObject({ status: "resolved", rule_id: "DL-ART35-lease" });

    expect(() =>
      classify(
        leaseTree,
        { q_exclusive_possession: "no", q_indicia: "no" },
        { executionDate: "2024-06-01" },
      ),
    ).toThrow(/operative stamp treatment has not been established/);
  });

  it("refuses both unproved Delhi works/service residual terminals", () => {
    const worksTree = tree("DL-works-vs-service");
    expect(() =>
      classify(
        worksTree,
        { q_goods_transfer: "yes", q_deliverable: "yes" },
        { executionDate: "2024-06-01" },
      ),
    ).toThrow(/Complete current notification history/);
    expect(() =>
      classify(worksTree, { q_goods_transfer: "no" }, { executionDate: "2024-06-01" }),
    ).toThrow(/excluding more specific/);
  });

  it("keeps historical Maharashtra routing available but refuses the stale current tree", () => {
    const worksTree = tree("MH-works-vs-service");
    const answers = { q_goods_transfer: "yes", q_specific_article: "no" };
    expect(classify(worksTree, answers, { executionDate: "2024-10-13" })).toMatchObject({
      status: "resolved",
      rule_id: "MH-ART63-works-contract",
    });
    expect(() => classify(worksTree, answers, { executionDate: "2024-10-14" })).toThrow(
      /STALE CURRENT CONSEQUENCE/,
    );
  });
});
