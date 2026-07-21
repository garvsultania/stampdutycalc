import type { NextRequest } from "next/server";
import { indiaTodayISO } from "./legal-date";

export const VERIFIED_POLICY = "verified-evidence";
export const LOCAL_DRAFT_POLICY = "local-draft";
export const LOCAL_DRAFT_ACK = "UNVERIFIED_LOCAL_ONLY";

export interface LegalExecutionOptions {
  requireVerified: boolean;
  requireEvidence: boolean;
  evidenceAsOf: string;
}

interface PolicyEnvironment {
  configured?: string;
  acknowledgement?: string;
  nodeEnv?: string;
  hostname?: string;
}

/**
 * Resolve the legal execution policy. The absence of configuration is the
 * strict verified-and-evidenced policy. Draft execution requires two explicit
 * settings, a non-production process, and a loopback request.
 *
 * NODE_ENV is only a one-way guard against draft mode; it never enables draft
 * mode. An accidentally development-labelled deployment therefore remains
 * fail closed.
 */
export function resolveExecutionPolicy(environment: PolicyEnvironment = {}): LegalExecutionOptions {
  const configured = environment.configured ?? VERIFIED_POLICY;
  if (configured === VERIFIED_POLICY) {
    return {
      requireVerified: true,
      requireEvidence: true,
      evidenceAsOf: indiaTodayISO(),
    };
  }

  if (configured !== LOCAL_DRAFT_POLICY) {
    throw new Error(
      `invalid STAMPDRAFT_EXECUTION_POLICY "${configured}"; expected "${VERIFIED_POLICY}" or "${LOCAL_DRAFT_POLICY}"`,
    );
  }
  if (environment.acknowledgement !== LOCAL_DRAFT_ACK) {
    throw new Error("local draft mode requires the explicit UNVERIFIED_LOCAL_ONLY acknowledgement");
  }
  if (environment.nodeEnv === "production") {
    throw new Error("local draft mode is disabled when NODE_ENV=production");
  }
  if (!environment.hostname || !isLoopbackHost(environment.hostname)) {
    throw new Error("local draft mode accepts loopback requests only");
  }
  return {
    requireVerified: false,
    requireEvidence: false,
    evidenceAsOf: indiaTodayISO(),
  };
}

export function executionPolicyForRequest(request: NextRequest): LegalExecutionOptions {
  return resolveExecutionPolicy({
    configured: process.env.STAMPDRAFT_EXECUTION_POLICY,
    acknowledgement: process.env.STAMPDRAFT_LOCAL_DRAFT_ACK,
    nodeEnv: process.env.NODE_ENV,
    hostname: request.nextUrl.hostname,
  });
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
