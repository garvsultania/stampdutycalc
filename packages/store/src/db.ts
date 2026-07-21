import { runMigrations } from "./migrations.js";

/** The minimum surface both drivers share — keeps the repository driver-agnostic. */
export interface DbSession {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Run a multi-statement script (migrations). Parameterised queries use `query`;
   * the extended protocol only carries one statement at a time. */
  exec(sql: string): Promise<void>;
}

export interface Db extends DbSession {
  transaction<T>(work: (transaction: DbSession) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Connect to Postgres.
 *
 * With a URL, this is node-postgres against a real server — the only path any
 * application should use. Without one, PGlite: Postgres itself compiled to WASM,
 * in-process. That fallback exists for the test suite, where it matters that the
 * DDL, the plpgsql immutability triggers and the constraints are genuine Postgres
 * semantics rather than a SQLite-shaped approximation of them.
 *
 * PGlite cannot be loaded inside a bundler's server runtime (Next included): its
 * WASM loader does `instanceof URL` against a URL built in another module realm
 * and rejects it. Treat the no-URL path as test-only.
 */
export async function connect(databaseUrl = process.env.DATABASE_URL): Promise<Db> {
  if (databaseUrl) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: databaseUrl });
    const sessionFor = (client: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> }): DbSession => ({
      query: async <T>(sql: string, params?: unknown[]) => {
        const res = await client.query(sql, params);
        return { rows: res.rows as T[] };
      },
      exec: async (sql) => {
        await client.query(sql);
      },
    });
    return {
      query: async (sql, params) => {
        const res = await pool.query(sql, params as unknown[]);
        return { rows: res.rows };
      },
      exec: async (sql) => {
        await pool.query(sql);
      },
      transaction: async (work) => {
        const client = await pool.connect();
        const transaction = sessionFor(client);
        try {
          await client.query("BEGIN");
          const value = await work(transaction);
          await client.query("COMMIT");
          return value;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  // A path persists across restarts; in-memory when STAMPDRAFT_DB_PATH is unset.
  const pg = new PGlite(process.env.STAMPDRAFT_DB_PATH);
  const session: DbSession = {
    query: async <T>(sql: string, params?: unknown[]) => {
      const res = await pg.query(sql, params);
      return { rows: res.rows as T[] };
    },
    exec: async (sql) => {
      await pg.exec(sql);
    },
  };
  return {
    ...session,
    transaction: async (work) => {
      await pg.exec("BEGIN");
      try {
        const value = await work(session);
        await pg.exec("COMMIT");
        return value;
      } catch (error) {
        await pg.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => pg.close(),
  };
}

/** Apply only unapplied, checksummed, forward-only schema migrations. */
export async function migrate(db: Db): Promise<void> {
  await runMigrations(db);
}
