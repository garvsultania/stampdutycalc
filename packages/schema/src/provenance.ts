import { z } from "zod";
import { ISODateSchema } from "./primitives.js";

export const SHA256Schema = z.string().regex(/^[a-f0-9]{64}$/, "must be a lowercase SHA-256 hex digest");

export const EvidenceDocumentRefSchema = z
  .object({
    sha256: SHA256Schema,
    source_id: z.string().min(1),
    source_row_id: z.string().min(1),
    /** Successful acquisition run that archived this exact document. */
    run_id: z.string().min(1),
    published_on: ISODateSchema,
    role: z.enum(["base_act", "amendment", "notification", "order", "commencement", "consolidation", "judgment"]),
    locator: z
      .object({
        kind: z.enum(["page", "section", "paragraph", "table", "raw_text"]),
        value: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type EvidenceDocumentRef = z.infer<typeof EvidenceDocumentRefSchema>;

export const EvidenceAuditRefSchema = z
  .object({
    source_id: z.string().min(1),
    /** Successful complete sweep whose range_to derives audited_through. */
    run_id: z.string().min(1),
    audited_through: ISODateSchema,
  })
  .strict();
export type EvidenceAuditRef = z.infer<typeof EvidenceAuditRefSchema>;

const EvidenceChainSchema = z
  .object({
    /** First publication date covered by the cited complete sweeps. */
    checked_from: ISODateSchema,
    checked_through: ISODateSchema,
    /** Every official source family that must be complete for this chain. This
     * remains required when documents is empty: a negative finding needs a
     * named source and a successful sweep, not an unexplained empty list. */
    source_ids: z.array(z.string().min(1)).min(1),
    /** Relevant document hashes, all of which must also appear in documents. Empty
     * is explicit: the accepted sweep found no separate instrument in this chain. */
    documents: z.array(SHA256Schema),
  })
  .strict()
  .superRefine((chain, ctx) => {
    if (chain.checked_through < chain.checked_from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "checked_through must be on or after checked_from",
        path: ["checked_through"],
      });
    }
    if (new Set(chain.source_ids).size !== chain.source_ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source_ids must not contain duplicates",
        path: ["source_ids"],
      });
    }
  });

export const CitationEvidenceSchema = z
  .object({
    documents: z.array(EvidenceDocumentRefSchema).min(1),
    audits: z.array(EvidenceAuditRefSchema).min(1),
    amendment_chain: EvidenceChainSchema,
    commencement_chain: EvidenceChainSchema,
    reviewed_by: z.string().min(1),
    reviewed_on: ISODateSchema,
  })
  .strict()
  .superRefine((evidence, ctx) => {
    const documentHashes = new Set(evidence.documents.map((document) => document.sha256));
    for (const [chainName, chain] of [
      ["amendment_chain", evidence.amendment_chain],
      ["commencement_chain", evidence.commencement_chain],
    ] as const) {
      for (const sha256 of chain.documents) {
        if (!documentHashes.has(sha256)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${chainName} references a document not present in evidence.documents`,
            path: [chainName, "documents"],
          });
          continue;
        }
        const document = evidence.documents.find((candidate) => candidate.sha256 === sha256);
        if (document && !chain.source_ids.includes(document.source_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${chainName} document source ${document.source_id} is absent from source_ids`,
            path: [chainName, "source_ids"],
          });
        }
      }
      for (const sourceId of chain.source_ids) {
        if (
          !evidence.audits.some(
            (audit) => audit.source_id === sourceId && audit.audited_through >= chain.checked_through,
          )
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${chainName} source ${sourceId} has no audit through ${chain.checked_through}`,
            path: [chainName, "checked_through"],
          });
        }
      }
      if (chain.checked_through > evidence.reviewed_on) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${chainName}.checked_through cannot be later than reviewed_on`,
          path: [chainName, "checked_through"],
        });
      }
    }
    for (const document of evidence.documents) {
      if (!evidence.audits.some((audit) => audit.source_id === document.source_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `document source ${document.source_id} has no corresponding audit`,
          path: ["audits"],
        });
      }
      if (document.published_on > evidence.reviewed_on) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `document ${document.sha256} was published after reviewed_on`,
          path: ["reviewed_on"],
        });
      }
    }
  });
export type CitationEvidence = z.infer<typeof CitationEvidenceSchema>;

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
    /** Optional in draft data; mandatory on every production dependency. */
    evidence: CitationEvidenceSchema.optional(),
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
