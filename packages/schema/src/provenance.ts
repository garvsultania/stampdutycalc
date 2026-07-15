import { z } from "zod";
import { ISODateSchema } from "./primitives.js";

/**
 * Citation — the legal source of a rule. NON-NEGOTIABLE (PRD §15, handoff law #4):
 * a rule without a source citation is invalid by construction. Enforced here at
 * the type level: both `ref` and `quoted_text` are required and non-empty. There
 * is no way to construct a valid rule/modifier/penalty version without one.
 *
 * `quoted_text` carries the verbatim statute/notification text so that a review
 * PR diff is self-contained and reviewable without leaving GitHub (PRD §6.3).
 */
export const CitationSchema = z
  .object({
    type: z.enum(["act", "amendment_act", "notification", "order"]),
    /** Act name, section, notification number, or order reference. */
    ref: z.string().min(1, "citation.ref is required"),
    /** Article / Schedule entry, where applicable. */
    article: z.string().optional(),
    gazette_date: ISODateSchema.optional(),
    url: z.string().url().optional(),
    /** Verbatim source text — makes the PR diff self-contained. Required. */
    quoted_text: z.string().min(1, "citation.quoted_text is required"),
  })
  .strict();
export type Citation = z.infer<typeof CitationSchema>;

/**
 * VersionMeta — append-only version envelope shared by rules, modifiers, and
 * penalty regimes. NEVER mutate a version; supersede it with a new one whose
 * `effective_from` opens where the predecessor's `effective_to` closes (PRD §6.1).
 *
 * `verified_by` / `verified_on` are populated ONLY when the review PR is merged
 * (PRD §6.3). They must be null in an unmerged encoding; the ruleset validator
 * and CI treat a non-null verification with no corresponding merge as invalid.
 */
export const VersionMetaSchema = z
  .object({
    effective_from: ISODateSchema,
    effective_to: ISODateSchema.nullable(),
    supersedes: z.string().nullable().default(null),
    source: CitationSchema,
    verified_by: z.string().nullable().default(null),
    verified_on: ISODateSchema.nullable().default(null),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.effective_to !== null && v.effective_to <= v.effective_from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "effective_to must be strictly after effective_from",
        path: ["effective_to"],
      });
    }
    // Verification is all-or-nothing: both fields set together or neither.
    if ((v.verified_by === null) !== (v.verified_on === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "verified_by and verified_on must be set together (populated on PR merge)",
        path: ["verified_by"],
      });
    }
  });
export type VersionMeta = z.infer<typeof VersionMetaSchema>;
