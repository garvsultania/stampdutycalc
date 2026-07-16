import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database } from "lucide-react";

/**
 * Shown instead of the workspace when there is no reachable Postgres. The
 * calculator itself is unaffected — the engine is pure and needs no database.
 */
export function WorkspaceUnavailable({ detail }: { detail: string }) {
  return (
    <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Database className="size-4 text-amber-600" />
        <CardTitle className="text-base">Workspace needs a database</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Matters and the audit trail are stored in Postgres. The calculator works without one —
          only filing a computation to a matter requires it.
        </p>
        <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs">
{`docker run -d --name stampdraft-db -p 5432:5432 \\
  -e POSTGRES_PASSWORD=stampdraft postgres:16

echo 'DATABASE_URL=postgres://postgres:stampdraft@127.0.0.1:5432/postgres' \\
  > apps/web/.env.local`}
        </pre>
        <p className="text-muted-foreground">
          The schema, the append-only triggers and the tables are created on first request.
        </p>
        <p className="font-mono text-xs text-amber-700 dark:text-amber-500">{detail}</p>
      </CardContent>
    </Card>
  );
}
