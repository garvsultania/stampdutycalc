import { z } from "zod";
import { InstrumentSchema, JurisdictionSchema } from "./primitives.js";
import { VersionMetaSchema } from "./provenance.js";
import { PendingVerificationSchema } from "./pending.js";

/**
 * Classification tree node (PRD §6.2, Flow B). Stored as data, versioned like
 * rules. Three node kinds:
 *  - question : a legal test with labelled edges to next nodes.
 *  - terminal : resolves to a Schedule entry / rule_id.
 *  - escalate : an explicit grey-zone stop with reason text — the tree ESCALATES
 *               rather than guessing (PRD §6.2, §11). This is the S.6 trigger.
 */
export type ClassificationNode =
  | {
      type: "question";
      text: string;
      /** the statutory/judicial test this question encodes */
      legal_test: string;
      edges: Array<{ answer: string; to: string }>;
    }
  | { type: "terminal"; instrument: string; article: string; rule_id: string }
  | { type: "escalate"; reason: string };

export const ClassificationNodeSchema: z.ZodType<ClassificationNode> = z.union([
  z
    .object({
      type: z.literal("question"),
      text: z.string().min(1),
      legal_test: z.string().min(1),
      edges: z.array(z.object({ answer: z.string().min(1), to: z.string().min(1) }).strict()).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("terminal"),
      instrument: InstrumentSchema,
      article: z.string().min(1),
      rule_id: z.string().min(1),
    })
    .strict(),
  z.object({ type: z.literal("escalate"), reason: z.string().min(1) }).strict(),
]);

export const ClassificationTreeSchema = z
  .object({
    tree_id: z.string().min(1),
    jurisdiction: JurisdictionSchema,
    /** e.g. "lease_vs_leave_and_license", "works_vs_service" */
    instrument_class: z.string().min(1),
    root: z.string().min(1),
    nodes: z.record(ClassificationNodeSchema),
    pending_verification: z.array(PendingVerificationSchema).default([]),
    version: VersionMetaSchema,
    notes_for_reviewer: z.string().default(""),
  })
  .strict()
  .superRefine((tree, ctx) => {
    if (!(tree.root in tree.nodes)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `root node "${tree.root}" not in nodes`, path: ["root"] });
    }
    for (const [id, node] of Object.entries(tree.nodes)) {
      if (node.type === "question") {
        for (const edge of node.edges) {
          if (!(edge.to in tree.nodes)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `node "${id}" edge "${edge.answer}" points to missing node "${edge.to}"`,
              path: ["nodes", id],
            });
          }
        }
      }
    }
  });
export type ClassificationTree = z.infer<typeof ClassificationTreeSchema>;
