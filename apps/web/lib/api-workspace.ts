import "server-only";
import { NextResponse } from "next/server";
import { getStore, WorkspaceUnavailableError, type Workspace } from "@/lib/store-server";

type Resolved = { ok: true; workspace: Workspace } | { ok: false; response: NextResponse };

/**
 * Resolves the workspace, or a 503 explaining that no database is configured.
 * A missing database is a deployment condition, not a client error — the caller
 * should say so plainly rather than surfacing a connection stack trace.
 */
export async function resolveWorkspace(): Promise<Resolved> {
  try {
    return { ok: true, workspace: await getStore() };
  } catch (error: unknown) {
    if (error instanceof WorkspaceUnavailableError) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "workspace unavailable", detail: error.detail },
          { status: 503 },
        ),
      };
    }
    throw error;
  }
}
