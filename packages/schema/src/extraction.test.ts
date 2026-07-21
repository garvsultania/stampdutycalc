import { describe, expect, it } from "vitest";
import { RuleInputContractSchema } from "./input-contract.js";
import {
  DocumentIntakeSchema,
  ExtractionDraftSchema,
  ExtractionDocumentLifecycleSchema,
  applyExtractionLifecycleEvent,
  confirmExtraction,
  createExtractionDocumentLifecycle,
  redactExtractionDraft,
  validateExtractionDraft,
} from "./extraction.js";

const contract = RuleInputContractSchema.parse({
  jurisdiction: "DL",
  rule_id: "R",
  effective_from: "2020-01-01",
  effective_to: null,
  fields: [
    { key: "consideration", label: "Consideration", kind: "value", type: "money" },
    {
      key: "category",
      label: "Category",
      kind: "fact",
      type: "select",
      options: [{ value: "individual", label: "Individual" }],
    },
    { key: "term_months", label: "Term", kind: "value", type: "positive_integer", required: false },
  ],
});

const draft = {
  schema_version: "1",
  draft_id: "f0864650-f919-4c9e-98b0-b7407c8c0939",
  document_id: "d31d59d1-c175-4270-ac28-83ff0c90d745",
  model_version: "extract-small-2026-07-21",
  page_count: 12,
  fields: [
    {
      key: "consideration",
      kind: "value",
      status: "found",
      proposed_value: "1000000",
      source: { page: 4, snippet: "consideration of Rupees Ten Lakh" },
    },
    { key: "category", kind: "fact", status: "not_found", proposed_value: null, source: null },
    { key: "term_months", kind: "value", status: "not_found", proposed_value: null, source: null },
  ],
} as const;

describe("Tier 2 extraction contracts", () => {
  it("requires explicit consent, a supported format, and the 60-page cap", () => {
    expect(DocumentIntakeSchema.parse({
      filename: "draft.pdf",
      media_type: "application/pdf",
      page_count: 60,
      consent_to_process: true,
    }).retention_days).toBe(30);
    expect(() => DocumentIntakeSchema.parse({
      filename: "draft.pdf",
      media_type: "application/pdf",
      page_count: 61,
      consent_to_process: true,
    })).toThrow();
    expect(() => DocumentIntakeSchema.parse({
      filename: "draft.pdf",
      media_type: "application/pdf",
      page_count: 1,
      consent_to_process: false,
    })).toThrow();
  });

  it("requires one provider result for every contract field and no extras", () => {
    expect(validateExtractionDraft(contract, draft).fields).toHaveLength(3);
    expect(() => validateExtractionDraft(contract, { ...draft, fields: draft.fields.slice(1) })).toThrow(
      /missing fields: consideration/,
    );
    expect(() => validateExtractionDraft(contract, {
      ...draft,
      fields: [...draft.fields, { key: "invented", kind: "fact", status: "not_found", proposed_value: null, source: null }],
    })).toThrow(/unknown fields: invented/);
  });

  it("rejects snippets whose page lies outside the document", () => {
    expect(() => ExtractionDraftSchema.parse({
      ...draft,
      fields: [{
        ...draft.fields[0],
        source: { page: 13, snippet: "outside" },
      }, ...draft.fields.slice(1)],
    })).toThrow(/source page exceeds the document page count/);
  });

  it("returns only confirmed engine fields and the model version, never snippets", () => {
    const result = confirmExtraction(contract, draft, {
      draft_id: draft.draft_id,
      fields: [
        { key: "consideration", kind: "value", confirmed_value: "1250000", disposition: "edited" },
        { key: "category", kind: "fact", confirmed_value: "individual", disposition: "entered" },
        { key: "term_months", kind: "value", confirmed_value: null, disposition: "not_applicable" },
      ],
    });
    expect(result).toEqual({
      values: { consideration: "1250000" },
      facts: { category: "individual" },
      extraction_model_version: "extract-small-2026-07-21",
    });
    expect(JSON.stringify(result)).not.toContain("Rupees Ten Lakh");
  });

  it("redacts proposed values and snippets before fields enter persisted job state", () => {
    const redacted = redactExtractionDraft(draft);
    expect(redacted[0]).toEqual({
      key: "consideration",
      kind: "value",
      status: "found",
      source_page: 4,
    });
    expect(JSON.stringify(redacted)).not.toMatch(/1000000|Rupees Ten Lakh|proposed_value|snippet/);
  });

  it("refuses unconfirmed required fields and false accepted dispositions", () => {
    expect(() => confirmExtraction(contract, draft, {
      draft_id: draft.draft_id,
      fields: [
        { key: "consideration", kind: "value", confirmed_value: "999", disposition: "accepted" },
        { key: "category", kind: "fact", confirmed_value: null, disposition: "not_applicable" },
        { key: "term_months", kind: "value", confirmed_value: null, disposition: "not_applicable" },
      ],
    })).toThrow(/accepted value does not match/);
    expect(() => confirmExtraction(contract, draft, {
      draft_id: draft.draft_id,
      fields: [
        { key: "consideration", kind: "value", confirmed_value: "1000000", disposition: "accepted" },
        { key: "category", kind: "fact", confirmed_value: null, disposition: "not_applicable" },
        { key: "term_months", kind: "value", confirmed_value: null, disposition: "not_applicable" },
      ],
    })).toThrow(/required extracted field category must be confirmed/);
  });

  it("deletes compute-and-delete documents and snippets together after confirmation", () => {
    const lifecycle = createExtractionDocumentLifecycle({
      filename: "draft.pdf",
      media_type: "application/pdf",
      page_count: 12,
      retention_days: 0,
      consent_to_process: true,
    }, draft.document_id, "2026-07-21T10:00:00.000Z");

    expect(lifecycle).toMatchObject({
      storage_region: "IN",
      retention_policy: "compute_and_delete",
      delete_by: null,
      state: "active",
      snippets_state: "active",
    });
    expect(applyExtractionLifecycleEvent(
      lifecycle,
      "confirmation_completed",
      "2026-07-21T10:05:00.000Z",
    )).toMatchObject({
      state: "deleted",
      snippets_state: "deleted",
      deleted_at: "2026-07-21T10:05:00.000Z",
      deletion_reason: "confirmation_completed",
    });
    expect(() => applyExtractionLifecycleEvent(
      lifecycle,
      "retention_expired",
      "2026-07-22T09:59:59.000Z",
    )).toThrow(/has not elapsed/);
    expect(applyExtractionLifecycleEvent(
      lifecycle,
      "retention_expired",
      "2026-07-22T10:00:00.000Z",
    ).deletion_reason).toBe("retention_expired");
  });

  it("enforces the thirty-day deadline and permits earlier user deletion", () => {
    const lifecycle = createExtractionDocumentLifecycle({
      filename: "draft.docx",
      media_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      page_count: 3,
      retention_days: 30,
      consent_to_process: true,
    }, draft.document_id, "2026-07-21T10:00:00.000Z");

    expect(lifecycle.delete_by).toBe("2026-08-20T10:00:00.000Z");
    expect(applyExtractionLifecycleEvent(
      lifecycle,
      "confirmation_completed",
      "2026-07-21T10:05:00.000Z",
    )).toEqual(lifecycle);
    expect(() => applyExtractionLifecycleEvent(
      lifecycle,
      "retention_expired",
      "2026-08-20T09:59:59.000Z",
    )).toThrow(/has not elapsed/);
    expect(applyExtractionLifecycleEvent(
      lifecycle,
      "user_deleted",
      "2026-07-22T10:00:00.000Z",
    ).deletion_reason).toBe("user_deleted");
    expect(applyExtractionLifecycleEvent(
      lifecycle,
      "retention_expired",
      "2026-08-20T10:00:00.000Z",
    ).deletion_reason).toBe("retention_expired");
  });

  it("rejects any receipt that claims snippets survived document deletion", () => {
    expect(() => ExtractionDocumentLifecycleSchema.parse({
      schema_version: "1",
      document_id: draft.document_id,
      storage_region: "IN",
      retention_policy: "compute_and_delete",
      accepted_at: "2026-07-21T10:00:00.000Z",
      delete_by: null,
      state: "deleted",
      snippets_state: "active",
      deleted_at: "2026-07-21T10:05:00.000Z",
      deletion_reason: "confirmation_completed",
    })).toThrow(/must share one lifecycle state/);
  });

  it("compares lifecycle timestamps as instants rather than offset-bearing strings", () => {
    const lifecycle = createExtractionDocumentLifecycle({
      filename: "draft.pdf",
      media_type: "application/pdf",
      page_count: 1,
      retention_days: 0,
      consent_to_process: true,
    }, draft.document_id, "2026-07-21T10:00:00+05:30");

    expect(applyExtractionLifecycleEvent(
      lifecycle,
      "confirmation_completed",
      "2026-07-21T04:31:00Z",
    ).state).toBe("deleted");
    expect(() => applyExtractionLifecycleEvent(
      lifecycle,
      "confirmation_completed",
      "2026-07-21T04:29:59Z",
    )).toThrow(/predates/);
  });
});
