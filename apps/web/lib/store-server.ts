import "server-only";
import { connect, migrate, Store } from "@stampdraft/store";

/**
 * Workspace persistence. The workspace requires a real Postgres via DATABASE_URL.
 *
 * PGlite (the in-process Postgres the store's own test suite runs against) cannot
 * be loaded inside Next's server runtime — its WASM loader does `instanceof URL`
 * against a URL from a different module realm and rejects it. So the web app
 * always speaks to Postgres over the wire, and PGlite stays a test-only dependency.
 */
let cached: Promise<Workspace> | null = null;

export interface Workspace {
  store: Store;
  firmId: string;
}

export const ENGINE_VERSION = "0.1.0";

/** The signed-in professional. AUTH IS NOT BUILT — see WORKSPACE-AUTH note. */
export const DEMO_USER = { email: "you@firm.in", name: "Demo User" };

export class WorkspaceUnavailableError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "WorkspaceUnavailableError";
  }
}

export function getStore(): Promise<Workspace> {
  cached ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new WorkspaceUnavailableError(
        "DATABASE_URL is not set. The workspace needs a Postgres to file computations to.",
      );
    }
    try {
      const db = await connect(url);
      await migrate(db);
      const store = new Store(db);
      // Single-tenant bootstrap until real auth lands.
      const firm = await store.ensureFirm("Demo Firm");
      await store.addUser(firm.id, DEMO_USER.email, DEMO_USER.name);
      return { store, firmId: firm.id };
    } catch (error: unknown) {
      cached = null; // a failed connect must not be cached forever
      const message = error instanceof Error ? error.message : String(error);
      throw new WorkspaceUnavailableError(`Could not reach Postgres at ${redact(url)} — ${message}`);
    }
  })();
  return cached;
}

/** Strips any password from a connection string before it reaches a log or a page. */
function redact(url: string): string {
  return url.replace(/\/\/([^:/@]+):[^@]*@/, "//$1:***@");
}
