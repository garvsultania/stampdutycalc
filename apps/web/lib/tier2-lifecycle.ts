import "server-only";
import { randomUUID } from "node:crypto";
import {
  DocumentIntakeSchema,
  ExtractionDraftSchema,
  applyExtractionLifecycleEvent,
  confirmExtraction,
  createExtractionDocumentLifecycle,
  inputContractActiveOn,
  redactExtractionDraft,
  validateExtractionDraft,
  type DocumentIntake,
  type ConfirmedExtractionValues,
  type ExtractionDraft,
  type ExtractionLifecycleEvent,
  type RuleInputContract,
} from "@stampdraft/schema";
import type { ExtractionJobRecord, Store } from "@stampdraft/store";
import {
  assertProductionProvider,
  type Tier2ExtractionProvider,
} from "./tier2-provider";

export const TIER2_MAX_BYTES = 20 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class Tier2LifecycleError extends Error {
  constructor(
    readonly code: "invalid_request" | "not_found" | "conflict" | "provider_unavailable",
    readonly publicMessage: string,
    readonly status: 400 | 404 | 409 | 503,
  ) {
    super(publicMessage);
    this.name = "Tier2LifecycleError";
  }
}

export interface PublicExtractionJob {
  id: string;
  document_id: string;
  filename: string;
  media_type: string;
  page_count: number;
  jurisdiction: string;
  rule_id: string;
  execution_date: string;
  retention_policy: "compute_and_delete" | "thirty_days";
  accepted_at: string;
  delete_by: string | null;
  status: ExtractionJobRecord["status"];
  model_version: string | null;
  fields: ExtractionJobRecord["redacted_fields"];
  failure_code: ExtractionJobRecord["failure_code"];
  confirmed_at: string | null;
  deleted_at: string | null;
  deletion_reason: ExtractionJobRecord["deletion_reason"];
  document_state: "active" | "deleted";
  snippets_state: "active" | "deleted";
}

export class Tier2LifecycleService {
  constructor(
    private readonly store: Store,
    private readonly provider: Tier2ExtractionProvider,
    options: { allowTestProvider?: boolean } = {},
  ) {
    try {
      assertProductionProvider(provider, options.allowTestProvider ?? false);
    } catch {
      throw new Tier2LifecycleError("provider_unavailable", "document extraction is unavailable", 503);
    }
  }

  async create(args: {
    firmId: string;
    userEmail: string;
    intake: unknown;
    bytes: Uint8Array;
    contract: RuleInputContract;
    executionDate: string;
    acceptedAt: string;
  }): Promise<PublicExtractionJob> {
    const intake = this.parseIntake(args.intake, args.bytes);
    this.assertContract(args.contract, args.executionDate);
    const documentId = randomUUID();
    const jobId = randomUUID();
    const lifecycle = createExtractionDocumentLifecycle(intake, documentId, args.acceptedAt);

    let stored;
    try {
      stored = await this.provider.putDocument({ documentId, bytes: args.bytes, intake });
    } catch {
      throw new Tier2LifecycleError("provider_unavailable", "document storage is unavailable", 503);
    }
    if (stored.mediaType !== intake.media_type || stored.pageCount !== intake.page_count) {
      await this.safeProviderDelete(stored.documentRef);
      throw new Tier2LifecycleError("invalid_request", "document type or page count could not be verified", 400);
    }

    try {
      await this.store.createExtractionJob({
        id: jobId,
        documentId,
        firmId: args.firmId,
        userEmail: args.userEmail,
        providerId: this.provider.id,
        documentRef: stored.documentRef,
        filename: intake.filename,
        mediaType: intake.media_type,
        pageCount: intake.page_count,
        jurisdiction: args.contract.jurisdiction,
        ruleId: args.contract.rule_id,
        executionDate: args.executionDate,
        retentionPolicy: lifecycle.retention_policy,
        acceptedAt: lifecycle.accepted_at,
        deleteBy: lifecycle.delete_by,
      });
      await this.store.markExtractionProcessing(args.firmId, jobId);
    } catch {
      await this.safeProviderDelete(stored.documentRef);
      throw new Tier2LifecycleError("provider_unavailable", "extraction job could not be persisted", 503);
    }

    let rawDraft: unknown;
    try {
      rawDraft = await this.provider.extractAndStoreDraft({
        documentRef: stored.documentRef,
        documentId,
        draftId: jobId,
        contract: args.contract,
      });
    } catch {
      return publicJob(await this.store.failExtractionJob(args.firmId, jobId, "provider_failed"));
    }

    try {
      const draft = validateExtractionDraft(args.contract, rawDraft);
      if (draft.document_id !== documentId || draft.draft_id !== jobId || draft.page_count !== intake.page_count) {
        throw new Error("provider draft identity does not match its persisted job");
      }
      return publicJob(await this.store.completeExtractionJob(
        args.firmId,
        jobId,
        draft.model_version,
        redactExtractionDraft(draft),
      ));
    } catch {
      return publicJob(await this.store.failExtractionJob(args.firmId, jobId, "invalid_provider_output"));
    }
  }

  async status(firmId: string, id: string): Promise<PublicExtractionJob> {
    return publicJob(await this.requireJob(firmId, id));
  }

  async readDraft(firmId: string, id: string, contract: RuleInputContract): Promise<ExtractionDraft> {
    const job = await this.requireReadableJob(firmId, id, contract);
    let raw: unknown;
    try {
      raw = await this.provider.readDraft(job.document_ref!);
    } catch {
      throw new Tier2LifecycleError("provider_unavailable", "extraction draft is unavailable", 503);
    }
    if (!raw) throw new Tier2LifecycleError("provider_unavailable", "extraction draft is unavailable", 503);
    let draft: ExtractionDraft;
    try {
      draft = validateExtractionDraft(contract, raw);
      if (draft.document_id !== job.document_id || draft.draft_id !== job.id || draft.page_count !== job.page_count) {
        throw new Error("provider draft identity mismatch");
      }
    } catch {
      throw new Tier2LifecycleError("provider_unavailable", "extraction draft failed validation", 503);
    }
    return ExtractionDraftSchema.parse(draft);
  }

  async confirm<T = undefined>(args: {
    firmId: string;
    id: string;
    contract: RuleInputContract;
    confirmation: unknown;
    occurredAt: string;
    /** Run the deterministic computation/audit consumer before the document is
     * marked confirmed or compute-and-delete removes provider state. A failed
     * consumer leaves the completed draft available for a safe retry. */
    consume?: (confirmed: ConfirmedExtractionValues) => Promise<T>;
  }): Promise<{ job: PublicExtractionJob; confirmed: ConfirmedExtractionValues; consumed: T }> {
    const job = await this.requireReadableJob(args.firmId, args.id, args.contract);
    if (job.status !== "completed") {
      throw new Tier2LifecycleError("conflict", "extraction job is not awaiting confirmation", 409);
    }
    const draft = await this.readDraft(args.firmId, args.id, args.contract);
    let confirmed: ConfirmedExtractionValues;
    try {
      confirmed = confirmExtraction(args.contract, draft, args.confirmation);
    } catch {
      throw new Tier2LifecycleError("invalid_request", "extraction confirmation is invalid", 400);
    }
    const consumed = args.consume
      ? await args.consume(confirmed)
      : undefined as T;
    this.applyLifecycle(job, "confirmation_completed", args.occurredAt);

    // Persist the confirmed state before touching the provider. If deletion or
    // the final DB transition fails, the expiry worker can safely retry without
    // rerunning the computation consumer.
    const persisted = await this.store.confirmExtractionJob(args.firmId, args.id, args.occurredAt);

    if (job.retention_policy === "compute_and_delete") {
      await this.deleteProviderState(job);
      const deleted = await this.store.deleteExtractionJob(
        args.firmId,
        args.id,
        args.occurredAt,
        "confirmation_completed",
      );
      return { job: publicJob(deleted), confirmed, consumed };
    }

    return { job: publicJob(persisted), confirmed, consumed };
  }

  async delete(
    firmId: string,
    id: string,
    occurredAt: string,
    reason: ExtractionLifecycleEvent = "user_deleted",
  ): Promise<PublicExtractionJob> {
    const job = await this.requireJob(firmId, id);
    if (job.status === "deleted") return publicJob(job);
    this.applyLifecycle(job, reason, occurredAt);
    await this.deleteProviderState(job);
    return publicJob(await this.store.deleteExtractionJob(firmId, id, occurredAt, reason));
  }

  async expireDue(occurredAt: string, limit = 100): Promise<{ deleted: number; failed: number }> {
    const due = await this.store.listExpiredExtractionJobs(occurredAt, limit);
    let deleted = 0;
    let failed = 0;
    for (const job of due) {
      try {
        await this.delete(
          job.firm_id,
          job.id,
          occurredAt,
          job.retention_policy === "compute_and_delete" && job.status === "confirmed"
            ? "confirmation_completed"
            : "retention_expired",
        );
        deleted += 1;
      } catch {
        failed += 1;
      }
    }
    return { deleted, failed };
  }

  private parseIntake(raw: unknown, bytes: Uint8Array): DocumentIntake {
    if (bytes.byteLength < 1 || bytes.byteLength > TIER2_MAX_BYTES) {
      throw new Tier2LifecycleError("invalid_request", "document size is outside the accepted limit", 400);
    }
    try {
      return DocumentIntakeSchema.parse(raw);
    } catch {
      throw new Tier2LifecycleError("invalid_request", "document intake is invalid", 400);
    }
  }

  private assertContract(contract: RuleInputContract, executionDate: string): void {
    if (!ISO_DATE_PATTERN.test(executionDate) || !inputContractActiveOn(contract, executionDate)) {
      throw new Tier2LifecycleError("invalid_request", "rule input contract is not active on the execution date", 400);
    }
  }

  private async requireJob(firmId: string, id: string): Promise<ExtractionJobRecord> {
    if (!UUID_PATTERN.test(id)) throw new Tier2LifecycleError("not_found", "extraction job not found", 404);
    const job = await this.store.getExtractionJob(firmId, id);
    if (!job) throw new Tier2LifecycleError("not_found", "extraction job not found", 404);
    return job;
  }

  private async requireReadableJob(
    firmId: string,
    id: string,
    contract: RuleInputContract,
  ): Promise<ExtractionJobRecord> {
    const job = await this.requireJob(firmId, id);
    if (job.status !== "completed" && job.status !== "confirmed") {
      throw new Tier2LifecycleError("conflict", "extraction draft is not available", 409);
    }
    if (
      job.provider_id !== this.provider.id ||
      !job.document_ref ||
      job.rule_id !== contract.rule_id ||
      job.jurisdiction !== contract.jurisdiction ||
      !inputContractActiveOn(contract, job.execution_date)
    ) {
      throw new Tier2LifecycleError("provider_unavailable", "extraction draft is unavailable", 503);
    }
    return job;
  }

  private applyLifecycle(
    job: ExtractionJobRecord,
    event: ExtractionLifecycleEvent,
    occurredAt: string,
  ): void {
    try {
      applyExtractionLifecycleEvent({
        schema_version: "1",
        document_id: job.document_id,
        storage_region: "IN",
        retention_policy: job.retention_policy,
        accepted_at: job.accepted_at,
        delete_by: job.delete_by,
        state: "active",
        snippets_state: "active",
        deleted_at: null,
        deletion_reason: null,
      }, event, occurredAt);
    } catch {
      throw new Tier2LifecycleError("conflict", "document lifecycle event is not currently allowed", 409);
    }
  }

  private async deleteProviderState(job: ExtractionJobRecord): Promise<void> {
    if (job.provider_id !== this.provider.id || !job.document_ref) {
      throw new Tier2LifecycleError("provider_unavailable", "document deletion is unavailable", 503);
    }
    try {
      await this.provider.deleteDocumentAndDraft(job.document_ref);
    } catch {
      throw new Tier2LifecycleError("provider_unavailable", "document deletion is unavailable", 503);
    }
  }

  private async safeProviderDelete(documentRef: string): Promise<void> {
    try {
      await this.provider.deleteDocumentAndDraft(documentRef);
    } catch {
      // The public error remains redacted; provider operations must be monitored
      // by the eventual deployment adapter.
    }
  }
}

export function publicJob(job: ExtractionJobRecord): PublicExtractionJob {
  const deleted = job.status === "deleted";
  return {
    id: job.id,
    document_id: job.document_id,
    filename: job.filename,
    media_type: job.media_type,
    page_count: job.page_count,
    jurisdiction: job.jurisdiction,
    rule_id: job.rule_id,
    execution_date: job.execution_date,
    retention_policy: job.retention_policy,
    accepted_at: job.accepted_at,
    delete_by: job.delete_by,
    status: job.status,
    model_version: job.model_version,
    fields: job.redacted_fields,
    failure_code: job.failure_code,
    confirmed_at: job.confirmed_at,
    deleted_at: job.deleted_at,
    deletion_reason: job.deletion_reason,
    document_state: deleted ? "deleted" : "active",
    snippets_state: deleted ? "deleted" : "active",
  };
}
