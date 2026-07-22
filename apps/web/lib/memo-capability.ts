import { createHmac, timingSafeEqual } from "node:crypto";

export const MEMO_CAPABILITY_TTL_SECONDS = 5 * 60;
const MAX_MEMO_CAPABILITY_TTL_SECONDS = 15 * 60;
const LOCAL_DEVELOPMENT_SECRET = "stampdraft-loopback-only-memo-capability-v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MemoCapability {
  version: 1;
  purpose: "computation_memo";
  recordId: string;
  firmId: string;
  issuedAt: number;
  expiresAt: number;
}

interface IssueMemoCapabilityOptions {
  secret: string;
  recordId: string;
  firmId: string;
  nowMs?: number;
  ttlSeconds?: number;
}

interface VerifyMemoCapabilityOptions {
  secret: string;
  expectedFirmId: string;
  nowMs?: number;
}

interface SecretEnvironment {
  configured?: string;
  nodeEnv?: string;
  hostname?: string;
}

export interface MemoRecordLookup {
  getComputation(firmId: string, recordId: string): Promise<unknown | null>;
}

export class MemoCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoCapabilityError";
  }
}

export function resolveMemoCapabilitySecret(environment: SecretEnvironment = {}): string {
  if (environment.configured !== undefined) {
    if (Buffer.byteLength(environment.configured, "utf8") < 32) {
      throw new MemoCapabilityError("STAMPDRAFT_MEMO_CAPABILITY_SECRET must be at least 32 bytes");
    }
    return environment.configured;
  }

  if (environment.nodeEnv === "production") {
    throw new MemoCapabilityError("STAMPDRAFT_MEMO_CAPABILITY_SECRET is required in production");
  }
  if (!environment.hostname || !isLoopbackHost(environment.hostname)) {
    throw new MemoCapabilityError(
      "STAMPDRAFT_MEMO_CAPABILITY_SECRET is required outside loopback development",
    );
  }
  return LOCAL_DEVELOPMENT_SECRET;
}

export function issueMemoCapability(options: IssueMemoCapabilityOptions): string {
  assertOpaqueId("record", options.recordId);
  assertOpaqueId("firm", options.firmId);
  const ttlSeconds = options.ttlSeconds ?? MEMO_CAPABILITY_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_MEMO_CAPABILITY_TTL_SECONDS) {
    throw new MemoCapabilityError(
      `memo capability lifetime must be between 1 and ${MAX_MEMO_CAPABILITY_TTL_SECONDS} seconds`,
    );
  }
  const issuedAt = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const payload: MemoCapability = {
    version: 1,
    purpose: "computation_memo",
    recordId: options.recordId,
    firmId: options.firmId,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, options.secret).toString("base64url")}`;
}

export function verifyMemoCapability(
  token: string,
  options: VerifyMemoCapabilityOptions,
): MemoCapability {
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
    throw new MemoCapabilityError("invalid memo capability");
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || !isBase64Url(parts[0]) || !isBase64Url(parts[1])) {
    throw new MemoCapabilityError("invalid memo capability");
  }

  const expectedSignature = signature(parts[0], options.secret);
  const suppliedSignature = Buffer.from(parts[1], "base64url");
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new MemoCapabilityError("invalid memo capability signature");
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw new MemoCapabilityError("invalid memo capability payload");
  }
  const payload = parsePayload(rawPayload);
  const now = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (payload.issuedAt > now + 30) throw new MemoCapabilityError("memo capability is not yet valid");
  if (payload.expiresAt <= now) throw new MemoCapabilityError("memo capability has expired");
  if (
    payload.expiresAt <= payload.issuedAt ||
    payload.expiresAt - payload.issuedAt > MAX_MEMO_CAPABILITY_TTL_SECONDS
  ) {
    throw new MemoCapabilityError("invalid memo capability lifetime");
  }
  if (payload.firmId !== options.expectedFirmId) {
    throw new MemoCapabilityError("memo capability is not valid for this firm");
  }
  return payload;
}

export async function issueMemoCapabilityForRecord(
  store: MemoRecordLookup,
  options: IssueMemoCapabilityOptions,
): Promise<string | null> {
  if (!UUID_PATTERN.test(options.recordId) || !UUID_PATTERN.test(options.firmId)) return null;
  const record = await store.getComputation(options.firmId, options.recordId);
  return record ? issueMemoCapability(options) : null;
}

export function hostnameFromHostHeader(host: string | null): string | undefined {
  if (!host) return undefined;
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? undefined : host.slice(1, end);
  }
  return host.split(":", 1)[0] || undefined;
}

function parsePayload(value: unknown): MemoCapability {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MemoCapabilityError("invalid memo capability payload");
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = ["expiresAt", "firmId", "issuedAt", "purpose", "recordId", "version"];
  const actualKeys = Object.keys(record).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new MemoCapabilityError("invalid memo capability payload shape");
  }
  if (
    record.version !== 1 ||
    record.purpose !== "computation_memo" ||
    typeof record.recordId !== "string" ||
    typeof record.firmId !== "string" ||
    typeof record.issuedAt !== "number" ||
    !Number.isInteger(record.issuedAt) ||
    typeof record.expiresAt !== "number" ||
    !Number.isInteger(record.expiresAt)
  ) {
    throw new MemoCapabilityError("invalid memo capability payload fields");
  }
  assertOpaqueId("record", record.recordId);
  assertOpaqueId("firm", record.firmId);
  return {
    version: 1,
    purpose: "computation_memo",
    recordId: record.recordId,
    firmId: record.firmId,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
  };
}

function assertOpaqueId(label: string, value: string): void {
  if (!UUID_PATTERN.test(value)) throw new MemoCapabilityError(`invalid ${label} identifier`);
}

function signature(payload: string, secret: string): Buffer {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new MemoCapabilityError("memo capability secret must be at least 32 bytes");
  }
  return createHmac("sha256", secret).update(payload).digest();
}

function isBase64Url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
