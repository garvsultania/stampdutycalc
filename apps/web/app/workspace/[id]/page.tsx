import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore, WorkspaceUnavailableError } from "@/lib/store-server";
import { AuditTrail, type AuditRow } from "@/components/workspace-client";
import { WorkspaceUnavailable } from "@/components/workspace-unavailable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MatterPage({ params }: { params: { id: string } }) {
  let workspace;
  try {
    workspace = await getStore();
  } catch (error: unknown) {
    if (error instanceof WorkspaceUnavailableError) {
      return (
        <div className="container py-8">
          <WorkspaceUnavailable detail={error.detail} />
        </div>
      );
    }
    throw error;
  }
  const { store, firmId } = workspace;
  const matter = await store.getMatter(firmId, params.id);
  if (!matter) notFound();

  const records = await store.listComputations(firmId, matter.id);

  // The memo route recomputes from these inputs — same reproducibility path as the audit.
  const rows: AuditRow[] = records.map((r) => ({
    id: r.id,
    computed_at: String(r.computed_at),
    jurisdiction: r.jurisdiction,
    rule_id: r.rule_id,
    execution_date: r.execution_date,
    total_duty: r.total_duty,
    rules_version: r.rules_version,
    user_email: r.user_email,
    engine_version: r.engine_version,
    extraction_model_version: r.extraction_model_version,
    memo_payload: Buffer.from(
      encodeURIComponent(
        JSON.stringify({
          input: {
            jurisdiction: r.jurisdiction,
            rule_id: r.rule_id,
            execution_date: r.execution_date,
            values: r.input_values,
            facts: r.input_facts,
            ...(r.duty_paid ? { duty_paid: r.duty_paid } : {}),
          },
          ...(r.penalty_months ? { penaltyMonths: r.penalty_months } : {}),
        }),
      ),
      "utf8",
    ).toString("base64"),
  }));

  return (
    <div className="container space-y-5 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link href="/workspace"><ArrowLeft /> All matters</Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Badge variant="secondary" className="font-mono text-[10px]">{matter.reference}</Badge>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight md:text-3xl">{matter.title}</h1>
          {matter.client && <p className="mt-1 text-sm text-muted-foreground">{matter.client}</p>}
        </div>
        <Button asChild>
          <Link href={`/compute?matter=${matter.id}`}><Plus /> New computation</Link>
        </Button>
      </div>

      <div>
        <h2 className="mb-3 font-serif text-lg font-semibold">Audit trail</h2>
        <AuditTrail records={rows} />
      </div>
    </div>
  );
}
