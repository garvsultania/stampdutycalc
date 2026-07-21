import "server-only";

export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Provider-neutral identity asserted by a trusted authentication adapter.
 * The firm remains untrusted until the store confirms this exact identity is
 * a member of it.
 */
export interface RequestIdentity {
  firmId: string;
  issuer: string;
  subject: string;
}

export interface RequestPrincipalAdapter {
  authenticate(headers: HeaderReader): Promise<RequestIdentity | null>;
  checkHealth(): Promise<boolean>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const denyAllAdapter: RequestPrincipalAdapter = {
  async authenticate() {
    return null;
  },
  async checkHealth() {
    return false;
  },
};

let configuredAdapter: RequestPrincipalAdapter = denyAllAdapter;

/** Install the deployment's authentication adapter. Until one is installed,
 * protected routes fail closed. The adapter must verify its own token/session
 * before returning an identity; this module deliberately chooses no IdP. */
export function installRequestPrincipalAdapter(adapter: RequestPrincipalAdapter): () => void {
  const previous = configuredAdapter;
  configuredAdapter = adapter;
  return () => {
    configuredAdapter = previous;
  };
}

export function isRequestPrincipalAdapterConfigured(): boolean {
  return configuredAdapter !== denyAllAdapter;
}

export async function requestPrincipalAdapterReady(): Promise<boolean> {
  if (!isRequestPrincipalAdapterConfigured()) return false;
  try {
    return await configuredAdapter.checkHealth();
  } catch {
    return false;
  }
}

export async function authenticateRequest(
  headers: HeaderReader,
  adapter: RequestPrincipalAdapter = configuredAdapter,
): Promise<RequestIdentity | null> {
  const identity = await adapter.authenticate(headers);
  if (!identity) return null;
  return validateIdentity(identity);
}

/** Opaque-token adapter for route and browser tests. It is intentionally not
 * installed automatically and does not interpret user-controlled identity
 * headers. */
export function createTestRequestPrincipalAdapter(
  token: string,
  identity: RequestIdentity,
): RequestPrincipalAdapter {
  if (!token.trim()) throw new Error("test principal token is required");
  const validIdentity = validateIdentity(identity);
  return {
    async authenticate(headers) {
      return headers.get("authorization") === `Bearer ${token}` ? validIdentity : null;
    },
    async checkHealth() {
      return true;
    },
  };
}

function validateIdentity(identity: RequestIdentity): RequestIdentity {
  const issuer = identity.issuer.trim();
  const subject = identity.subject.trim();
  if (!UUID_PATTERN.test(identity.firmId) || !issuer || !subject || issuer.length > 200 || subject.length > 500) {
    throw new Error("authentication adapter returned an invalid principal");
  }
  return { firmId: identity.firmId.toLowerCase(), issuer, subject };
}
