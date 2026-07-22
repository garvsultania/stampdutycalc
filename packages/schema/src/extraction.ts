import { z } from "zod";
import type { RuleInputContract } from "./input-contract.js";

export const EXTRACTION_PAGE_CAP = 60;

export const DocumentIntakeSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    media_type: z.enum([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    page_count: z.number().int().min(1).max(EXTRACTION_PAGE_CAP),
    retention_days: z.union([z.literal(0), z.literal(30)]).default(30),
    consent_to_process: z.literal(true),
  })
  .strict();
export type DocumentIntake = z.infer<typeof DocumentIntakeSchema>;

export const ExtractionDocumentLifecycleSchema = z
  .object({
    schema_version: z.literal("1"),
    document_id: z.string().uuid(),
    storage_region: z.literal("IN"),
    retention_policy: z.enum(["compute_and_delete", "thirty_days"]),
    accepted_at: z.string().datetime({ offset: true }),
    delete_by: z.string().datetime({ offset: true }).nullable(),
    state: z.enum(["active", "deleted"]),
    snippets_state: z.enum(["active", "deleted"]),
    deleted_at: z.string().datetime({ offset: true }).nullable(),
    deletion_reason: z.enum(["confirmation_completed", "user_deleted", "retention_expired"]).nullable(),
  })
  .strict()
  .superRefine((lifecycle, ctx) => {
    if (lifecycle.state !== lifecycle.snippets_state) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "document and snippets must share one lifecycle state",
        path: ["snippets_state"],
      });
    }
    const deleted = lifecycle.state === "deleted";
    if (deleted !== (lifecycle.deleted_at !== null && lifecycle.deletion_reason !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "deleted state requires both deletion timestamp and reason",
        path: ["deleted_at"],
      });
    }
    if (lifecycle.retention_policy === "compute_and_delete" && lifecycle.delete_by !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "compute-and-delete is event-bound and must not claim a timed retention deadline",
        path: ["delete_by"],
      });
    }
    if (lifecycle.retention_policy === "thirty_days" && lifecycle.delete_by === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "thirty-day retention requires a deletion deadline",
        path: ["delete_by"],
      });
    }
  });
export type ExtractionDocumentLifecycle = z.infer<typeof ExtractionDocumentLifecycleSchema>;
export type ExtractionLifecycleEvent = "confirmation_completed" | "user_deleted" | "retention_expired";

/** Create the provider-neutral retention receipt. This is a contract for the
 * eventual encrypted India-resident store, not a claim that such a store is
 * configured in the current deployment. */
export function createExtractionDocumentLifecycle(
  rawIntake: unknown,
  documentId: string,
  acceptedAt: string,
): ExtractionDocumentLifecycle {
  const intake = DocumentIntakeSchema.parse(rawIntake);
  const accepted = z.string().datetime({ offset: true }).parse(acceptedAt);
  const retentionPolicy = intake.retention_days === 0 ? "compute_and_delete" : "thirty_days";
  return ExtractionDocumentLifecycleSchema.parse({
    schema_version: "1",
    document_id: documentId,
    storage_region: "IN",
    retention_policy: retentionPolicy,
    accepted_at: accepted,
    delete_by: retentionPolicy === "thirty_days"
      ? new Date(Date.parse(accepted) + 30 * 24 * 60 * 60 * 1_000).toISOString()
      : null,
    state: "active",
    snippets_state: "active",
    deleted_at: null,
    deletion_reason: null,
  });
}

/** Apply a lifecycle event. Deleting the document and its source snippets is
 * atomic in the contract; a partial-deletion receipt is invalid by schema. */
export function applyExtractionLifecycleEvent(
  rawLifecycle: unknown,
  event: ExtractionLifecycleEvent,
  occurredAt: string,
): ExtractionDocumentLifecycle {
  const lifecycle = ExtractionDocumentLifecycleSchema.parse(rawLifecycle);
  const occurred = z.string().datetime({ offset: true }).parse(occurredAt);
  if (lifecycle.state === "deleted") return lifecycle;
  const occurredMs = Date.parse(occurred);
  if (occurredMs < Date.parse(lifecycle.accepted_at)) {
    throw new Error("lifecycle event predates document acceptance");
  }

  if (event === "confirmation_completed" && lifecycle.retention_policy === "thirty_days") {
    return lifecycle;
  }
  if (event === "retention_expired") {
    const deadline = lifecycle.retention_policy === "thirty_days"
      ? lifecycle.delete_by
      : new Date(Date.parse(lifecycle.accepted_at) + 24 * 60 * 60 * 1_000).toISOString();
    if (deadline === null || occurredMs < Date.parse(deadline)) {
      throw new Error("retention deadline has not elapsed");
    }
  }

  return ExtractionDocumentLifecycleSchema.parse({
    ...lifecycle,
    state: "deleted",
    snippets_state: "deleted",
    deleted_at: occurred,
    deletion_reason: event,
  });
}

const ExtractionFieldIdentitySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  kind: z.enum(["value", "fact"]),
});

const FoundExtractionFieldSchema = ExtractionFieldIdentitySchema.extend({
  status: z.literal("found"),
  proposed_value: z.string().min(1),
  source: z.object({
    page: z.number().int().min(1).max(EXTRACTION_PAGE_CAP),
    snippet: z.string().trim().min(1).max(2_000),
  }).strict(),
}).strict();

const MissingExtractionFieldSchema = ExtractionFieldIdentitySchema.extend({
  status: z.literal("not_found"),
  proposed_value: z.null(),
  source: z.null(),
}).strict();

export const ExtractedFieldSchema = z.discriminatedUnion("status", [
  FoundExtractionFieldSchema,
  MissingExtractionFieldSchema,
]);
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

export const ExtractionDraftSchema = z
  .object({
    schema_version: z.literal("1"),
    draft_id: z.string().uuid(),
    document_id: z.string().uuid(),
    model_version: z.string().trim().min(1).max(200),
    page_count: z.number().int().min(1).max(EXTRACTION_PAGE_CAP),
    fields: z.array(ExtractedFieldSchema).min(1).max(64),
  })
  .strict()
  .superRefine((draft, ctx) => {
    const keys = draft.fields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "extracted field keys must be unique", path: ["fields"] });
    }
    draft.fields.forEach((field, index) => {
      if (field.status === "found" && field.source.page > draft.page_count) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "source page exceeds the document page count",
          path: ["fields", index, "source", "page"],
        });
      }
    });
  });
export type ExtractionDraft = z.infer<typeof ExtractionDraftSchema>;

/** Safe persisted/status representation. Proposed values and verbatim source
 * snippets remain exclusively in the provider's ephemeral document lifecycle. */
export const RedactedExtractionFieldSchema = ExtractionFieldIdentitySchema.extend({
  status: z.enum(["found", "not_found"]),
  source_page: z.number().int().min(1).max(EXTRACTION_PAGE_CAP).nullable(),
}).strict();
export type RedactedExtractionField = z.infer<typeof RedactedExtractionFieldSchema>;

export function redactExtractionDraft(rawDraft: unknown): RedactedExtractionField[] {
  const draft = ExtractionDraftSchema.parse(rawDraft);
  return draft.fields.map((field) => RedactedExtractionFieldSchema.parse({
    key: field.key,
    kind: field.kind,
    status: field.status,
    source_page: field.status === "found" ? field.source.page : null,
  }));
}

export const ConfirmedExtractionFieldSchema = ExtractionFieldIdentitySchema.extend({
  confirmed_value: z.string().min(1).nullable(),
  disposition: z.enum(["accepted", "edited", "entered", "not_applicable"]),
}).strict();

export const ExtractionConfirmationSchema = z
  .object({
    draft_id: z.string().uuid(),
    fields: z.array(ConfirmedExtractionFieldSchema).min(1).max(64),
  })
  .strict()
  .superRefine((confirmation, ctx) => {
    const keys = confirmation.fields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "confirmed field keys must be unique", path: ["fields"] });
    }
  });
export type ExtractionConfirmation = z.infer<typeof ExtractionConfirmationSchema>;

export interface ConfirmedExtractionValues {
  values: Record<string, string>;
  facts: Record<string, string>;
  extraction_model_version: string;
}

/**
 * Bind provider output to the selected rule's shared input contract. Providers
 * must return every field, using `not_found` instead of inventing a value or a
 * snippet. This draft is ephemeral and must follow the uploaded document's
 * retention lifecycle.
 */
export function validateExtractionDraft(
  contract: RuleInputContract,
  rawDraft: unknown,
): ExtractionDraft {
  const draft = ExtractionDraftSchema.parse(rawDraft);
  const expected = new Map(contract.fields.map((field) => [field.key, field.kind]));
  const supplied = new Map(draft.fields.map((field) => [field.key, field.kind]));
  const missing = [...expected.keys()].filter((key) => !supplied.has(key));
  const unknown = [...supplied.keys()].filter((key) => !expected.has(key));
  const wrongKind = [...supplied].filter(([key, kind]) => expected.has(key) && expected.get(key) !== kind);
  if (missing.length > 0 || unknown.length > 0 || wrongKind.length > 0) {
    throw new Error([
      missing.length > 0 ? `missing fields: ${missing.join(", ")}` : "",
      unknown.length > 0 ? `unknown fields: ${unknown.join(", ")}` : "",
      wrongKind.length > 0 ? `wrong field kinds: ${wrongKind.map(([key]) => key).join(", ")}` : "",
    ].filter(Boolean).join("; "));
  }
  return draft;
}

/**
 * Require an explicit disposition for every extracted field and return only
 * confirmed values. Verbatim snippets never cross this boundary into the audit
 * payload; only the model version accompanies the confirmed engine inputs.
 */
export function confirmExtraction(
  contract: RuleInputContract,
  rawDraft: unknown,
  rawConfirmation: unknown,
): ConfirmedExtractionValues {
  const draft = validateExtractionDraft(contract, rawDraft);
  const confirmation = ExtractionConfirmationSchema.parse(rawConfirmation);
  if (confirmation.draft_id !== draft.draft_id) throw new Error("confirmation does not match the extraction draft");

  const confirmed = new Map(confirmation.fields.map((field) => [field.key, field]));
  const draftFields = new Map(draft.fields.map((field) => [field.key, field]));
  const missing = [...draftFields.keys()].filter((key) => !confirmed.has(key));
  const unknown = [...confirmed.keys()].filter((key) => !draftFields.has(key));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error([
      missing.length > 0 ? `unconfirmed fields: ${missing.join(", ")}` : "",
      unknown.length > 0 ? `unknown confirmed fields: ${unknown.join(", ")}` : "",
    ].filter(Boolean).join("; "));
  }

  const values: Record<string, string> = {};
  const facts: Record<string, string> = {};
  for (const contractField of contract.fields) {
    const extracted = draftFields.get(contractField.key)!;
    const field = confirmed.get(contractField.key)!;
    if (field.kind !== contractField.kind) throw new Error(`confirmed field kind does not match ${contractField.key}`);
    assertDisposition(extracted, field.disposition, field.confirmed_value, contractField.required);
    if (field.confirmed_value !== null) {
      (field.kind === "value" ? values : facts)[field.key] = field.confirmed_value;
    }
  }
  return { values, facts, extraction_model_version: draft.model_version };
}

function assertDisposition(
  extracted: ExtractedField,
  disposition: ExtractionConfirmation["fields"][number]["disposition"],
  value: string | null,
  required: boolean,
): void {
  if (required && value === null) throw new Error(`required extracted field ${extracted.key} must be confirmed`);
  if (disposition === "accepted" && (extracted.status !== "found" || value !== extracted.proposed_value)) {
    throw new Error(`accepted value does not match the extracted proposal for ${extracted.key}`);
  }
  if (disposition === "edited" && (extracted.status !== "found" || value === extracted.proposed_value)) {
    throw new Error(`edited value must change a found proposal for ${extracted.key}`);
  }
  if (disposition === "entered" && (extracted.status !== "not_found" || value === null)) {
    throw new Error(`entered value requires a not-found extraction for ${extracted.key}`);
  }
  if (disposition === "not_applicable" && (required || value !== null)) {
    throw new Error(`not-applicable is allowed only for an optional empty field (${extracted.key})`);
  }
}
