import "server-only";
import type {
  DocumentIntake,
  ExtractionDraft,
  RuleInputContract,
} from "@stampdraft/schema";

export interface Tier2ProviderCapabilities {
  storageRegion: "IN" | "test";
  encryptionAtRest: boolean;
  trainingUse: "none" | "unknown";
  atomicDocumentDraftDelete: boolean;
}

export interface Tier2StoredDocument {
  documentRef: string;
  mediaType: DocumentIntake["media_type"];
  pageCount: number;
}

export interface Tier2ExtractionProvider {
  readonly id: string;
  readonly kind: "external" | "test";
  readonly capabilities: Tier2ProviderCapabilities;
  checkHealth(): Promise<boolean>;
  putDocument(input: {
    documentId: string;
    bytes: Uint8Array;
    intake: DocumentIntake;
  }): Promise<Tier2StoredDocument>;
  extractAndStoreDraft(input: {
    documentRef: string;
    documentId: string;
    draftId: string;
    contract: RuleInputContract;
  }): Promise<unknown>;
  readDraft(documentRef: string): Promise<unknown | null>;
  /** Delete document bytes, provider draft, and every source snippet as one
   * provider operation. Implementations must be idempotent. */
  deleteDocumentAndDraft(documentRef: string): Promise<void>;
}

let configuredProvider: Tier2ExtractionProvider | null = null;

export function installTier2Provider(provider: Tier2ExtractionProvider): () => void {
  const previous = configuredProvider;
  configuredProvider = provider;
  return () => {
    configuredProvider = previous;
  };
}

export function getTier2Provider(): Tier2ExtractionProvider | null {
  return configuredProvider;
}

export function isProductionTier2ProviderConfigured(): boolean {
  if (!configuredProvider) return false;
  try {
    assertProductionProvider(configuredProvider, false);
    return true;
  } catch {
    return false;
  }
}

export async function productionTier2ProviderReady(): Promise<boolean> {
  if (!isProductionTier2ProviderConfigured() || !configuredProvider) return false;
  try {
    return await configuredProvider.checkHealth();
  } catch {
    return false;
  }
}

export function assertProductionProvider(provider: Tier2ExtractionProvider, allowTestProvider = false): void {
  if (provider.kind === "test") {
    if (allowTestProvider) return;
    throw new Error("test extraction providers are disabled outside tests");
  }
  const capability = provider.capabilities;
  if (
    capability.storageRegion !== "IN" ||
    !capability.encryptionAtRest ||
    capability.trainingUse !== "none" ||
    !capability.atomicDocumentDraftDelete
  ) {
    throw new Error("extraction provider does not satisfy the storage and privacy contract");
  }
}

type FakeDraftFactory = (input: {
  documentId: string;
  draftId: string;
  pageCount: number;
  contract: RuleInputContract;
}) => ExtractionDraft;

/** Deterministic in-memory provider for tests and evaluation fixtures only. */
export class LocalFakeTier2Provider implements Tier2ExtractionProvider {
  readonly id: string;
  readonly kind = "test" as const;
  readonly capabilities: Tier2ProviderCapabilities = {
    storageRegion: "test",
    encryptionAtRest: false,
    trainingUse: "none",
    atomicDocumentDraftDelete: true,
  };
  private readonly documents = new Map<string, {
    bytes: Uint8Array;
    intake: DocumentIntake;
    draft: ExtractionDraft | null;
  }>();

  constructor(private readonly draftFactory: FakeDraftFactory, id = "local-fake-tier2") {
    this.id = id;
  }

  async checkHealth(): Promise<boolean> {
    return true;
  }

  async putDocument(input: {
    documentId: string;
    bytes: Uint8Array;
    intake: DocumentIntake;
  }): Promise<Tier2StoredDocument> {
    const documentRef = `fake://${this.id}/${input.documentId}`;
    if (this.documents.has(documentRef)) throw new Error("fake document already exists");
    this.documents.set(documentRef, {
      bytes: new Uint8Array(input.bytes),
      intake: structuredClone(input.intake),
      draft: null,
    });
    return { documentRef, mediaType: input.intake.media_type, pageCount: input.intake.page_count };
  }

  async extractAndStoreDraft(input: {
    documentRef: string;
    documentId: string;
    draftId: string;
    contract: RuleInputContract;
  }): Promise<unknown> {
    const stored = this.documents.get(input.documentRef);
    if (!stored) throw new Error("fake document not found");
    const draft = this.draftFactory({
      documentId: input.documentId,
      draftId: input.draftId,
      pageCount: stored.intake.page_count,
      contract: input.contract,
    });
    stored.draft = structuredClone(draft);
    return structuredClone(draft);
  }

  async readDraft(documentRef: string): Promise<unknown | null> {
    const draft = this.documents.get(documentRef)?.draft;
    return draft ? structuredClone(draft) : null;
  }

  async deleteDocumentAndDraft(documentRef: string): Promise<void> {
    this.documents.delete(documentRef);
  }

  hasDocument(documentRef: string): boolean {
    return this.documents.has(documentRef);
  }
}
