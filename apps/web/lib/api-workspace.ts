import "server-only";
import { NextResponse } from "next/server";
import {
  getStore,
  WORKSPACE_UNAVAILABLE_PUBLIC_DETAIL,
  WorkspaceUnavailableError,
} from "@/lib/store-server";
import { authenticateRequest, type HeaderReader, type RequestIdentity } from "@/lib/request-principal";
import type { FirmUser, Store } from "@stampdraft/store";

type Resolved = { ok: true; workspace: Workspace } | { ok: false; response: NextResponse };

export interface WorkspacePrincipal extends RequestIdentity {
  userId: string;
  userEmail: string;
}

export interface Workspace {
  store: Store;
  firmId: string;
  principal: WorkspacePrincipal;
}

export class WorkspaceAuthorizationError extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? "authentication required" : "firm access refused");
    this.name = "WorkspaceAuthorizationError";
  }
}

/**
 * Resolves a verified request identity to an existing firm membership. Missing
 * authentication and cross-firm identities fail before route work begins; a
 * missing database remains a separate deployment condition.
 */
export async function resolveWorkspace(request: { headers: HeaderReader }): Promise<Resolved> {
  try {
    return { ok: true, workspace: await authorizeWorkspace(request.headers) };
  } catch (error: unknown) {
    if (error instanceof WorkspaceAuthorizationError) {
      return { ok: false, response: authorizationResponse(error.status) };
    }
    if (error instanceof WorkspaceUnavailableError) {
      return {
        ok: false,
        response: workspaceUnavailableResponse(),
      };
    }
    return { ok: false, response: internalErrorResponse("workspace access unavailable", 503) };
  }
}

export async function authorizeWorkspace(headers: HeaderReader): Promise<Workspace> {
  let identity: RequestIdentity | null;
  try {
    identity = await authenticateRequest(headers);
  } catch {
    throw new WorkspaceAuthorizationError(401);
  }
  if (!identity) throw new WorkspaceAuthorizationError(401);

  const store = await getStore();
  const member = await store.getFirmUserByIdentity(identity.firmId, identity.issuer, identity.subject);
  if (!member) throw new WorkspaceAuthorizationError(403);
  return workspaceFor(store, identity, member);
}

function workspaceFor(store: Store, identity: RequestIdentity, member: FirmUser): Workspace {
  return {
    store,
    firmId: identity.firmId,
    principal: {
      ...identity,
      userId: member.id,
      userEmail: member.email,
    },
  };
}

export function authorizationResponse(status: 401 | 403): NextResponse {
  const response = NextResponse.json(
    { ok: false, error: status === 401 ? "authentication required" : "firm access refused" },
    { status },
  );
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function internalErrorResponse(error = "request could not be completed", status = 500): NextResponse {
  const response = NextResponse.json({ ok: false, error }, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function workspaceUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "workspace unavailable", detail: WORKSPACE_UNAVAILABLE_PUBLIC_DETAIL },
    { status: 503 },
  );
}
