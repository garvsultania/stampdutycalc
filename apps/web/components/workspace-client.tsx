"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Matter } from "@stampdraft/store";
import { inr, formatDate, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, FolderPlus, Loader2, ShieldCheck, ShieldAlert, FileText, Lock } from "lucide-react";

type MatterRow = Matter & { computation_count: number };

export function MattersList({ initial }: { initial: MatterRow[] }) {
  const router = useRouter();
  const [matters, setMatters] = React.useState(initial);
  const [open, setOpen] = React.useState(initial.length === 0);
  const [form, setForm] = React.useState({ reference: "", title: "", client: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/matters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.ok) {
      setMatters((m) => [{ ...data.matter, computation_count: 0 }, ...m]);
      setForm({ reference: "", title: "", client: "" });
      setOpen(false);
      router.refresh();
    } else setError(data.error);
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight md:text-3xl">Matters</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every computation is written to an append-only audit log and can be replayed years later.
          </p>
        </div>
        {!open && (
          <Button onClick={() => setOpen(true)}>
            <FolderPlus /> New matter
          </Button>
        )}
      </div>

      {open && (
        <Card className="animate-fade-up">
          <CardHeader className="pb-4">
            <CardTitle className="font-serif text-lg">New matter</CardTitle>
            <CardDescription>Group computations under a file reference.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="matter-reference">Reference *</Label>
                <Input id="matter-reference" value={form.reference} placeholder="M-2026-014" onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="matter-title">Title *</Label>
                <Input id="matter-title" value={form.title} placeholder="Acme HQ acquisition" onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="matter-client">Client</Label>
                <Input id="matter-client" value={form.client} placeholder="Acme Ltd" onChange={(e) => setForm({ ...form, client: e.target.value })} />
              </div>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={create} disabled={busy || !form.reference.trim() || !form.title.trim()}>
                {busy && <Loader2 className="animate-spin" />} Create matter
              </Button>
              {matters.length > 0 && (
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {matters.length === 0 && !open ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-12 text-center">
          <p className="font-serif text-lg font-medium">No matters yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one to start filing computations against it.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matters.map((m) => (
            <Link key={m.id} href={`/workspace/${m.id}`} className="group">
              <Card className="h-full transition-all group-hover:border-primary/50 group-hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="font-mono text-[10px]">{m.reference}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <CardTitle className="pt-2 font-serif text-base leading-snug">{m.title}</CardTitle>
                  {m.client && <CardDescription>{m.client}</CardDescription>}
                </CardHeader>
                <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{m.computation_count} computation{m.computation_count === 1 ? "" : "s"}</span>
                  <span>{formatDate(String(m.created_at).slice(0, 10))}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export interface AuditRow {
  id: string;
  computed_at: string;
  jurisdiction: string;
  rule_id: string;
  execution_date: string;
  total_duty: string;
  rules_version: string;
  user_email: string;
  engine_version: string;
  extraction_model_version: string | null;
}

type Verdict = {
  verified: boolean;
  refused?: boolean;
  sameHash: boolean;
  recorded: { total: string; hash: string };
  replayed: { total: string; hash: string } | null;
  note: string;
};

export function AuditTrail({ records }: { records: AuditRow[] }) {
  const [verdicts, setVerdicts] = React.useState<Record<string, Verdict>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  async function verify(id: string) {
    setBusy(id);
    const res = await fetch("/api/computations/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recordId: id }),
    });
    const data = await res.json();
    if (data.ok || data.refused) setVerdicts((v) => ({ ...v, [id]: data }));
    setBusy(null);
  }

  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-12 text-center">
        <p className="font-serif text-lg font-medium">No computations filed</p>
        <p className="mt-1 text-sm text-muted-foreground">Run one from this matter and it lands here permanently.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((r) => {
        const v = verdicts[r.id];
        return (
          <Card key={r.id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{r.jurisdiction}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{r.rule_id}</span>
                    <Badge variant="outline" className="text-[10px]">
                      executed {formatDate(r.execution_date)}
                    </Badge>
                  </div>
                  <p className="tabular mt-2 font-serif text-2xl font-semibold">{inr(r.total_duty)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Filed {new Date(r.computed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{" "}
                    by {r.user_email} · engine {r.engine_version}
                    {r.extraction_model_version && ` · extraction ${r.extraction_model_version}`}
                  </p>
                  <p className="mt-1.5 break-all font-mono text-[10px] text-muted-foreground">{r.rules_version}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => verify(r.id)} disabled={busy === r.id}>
                    {busy === r.id ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Replay
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/api/computations/memo?recordId=${encodeURIComponent(r.id)}`} target="_blank">
                      <FileText /> Memo
                    </Link>
                  </Button>
                </div>
              </div>

              {v && (
                <div
                  className={cn(
                    "mt-3 flex items-start gap-2 rounded-md border p-3 text-xs animate-fade-up",
                    v.verified ? "border-emerald-600/30 bg-emerald-600/5" : "border-gold/40 bg-gold/5"
                  )}
                >
                  {v.verified ? (
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {v.verified ? "Reproduced exactly" : v.refused ? "Replay refused" : "Mismatch — investigate"}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">{v.note}</p>
                    {v.replayed && !v.verified && (
                      <p className="tabular mt-1 text-muted-foreground">
                        Recorded {inr(v.recorded.total)} · replayed from archive {inr(v.replayed.total)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function AuthNotice() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-gold/40 bg-gold/5 px-3 py-2 text-xs">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">Firm-scoped workspace.</span> Access is bound to the authenticated
        identity&apos;s stored firm membership; records from another firm are refused.
      </p>
    </div>
  );
}
