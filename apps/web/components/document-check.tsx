"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { ComputeOutput } from "@stampdraft/schema";
import { CATALOG, fieldsForRuleAtDate } from "@/lib/manifest";
import { todayISO } from "@/lib/utils";
import { unavailableRefusal, type ComputationRefusal } from "@/lib/computation-refusal";
import { DutyResult, EscalationCard } from "@/components/duty-result";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSearch, Loader2, ShieldCheck, Trash2 } from "lucide-react";

type StateCode = "DL" | "MH" | "KA";
type DraftField = {
  key: string;
  kind: "value" | "fact";
  status: "found" | "not_found";
  proposed_value: string | null;
  source: { page: number; snippet: string } | null;
};
type Draft = { draft_id: string; model_version: string; fields: DraftField[] };
type Job = { id: string; status: string; retention_policy: string; failure_code: string | null };

export function DocumentCheck() {
  const params = useSearchParams();
  const matterId = params.get("matter");
  const [state, setState] = React.useState<StateCode>("DL");
  const variants = React.useMemo(
    () => CATALOG[state].flatMap((instrument) => instrument.variants.map((variant) => ({
      ...variant,
      label: `${instrument.name} — ${variant.label}`,
    }))),
    [state],
  );
  const [ruleId, setRuleId] = React.useState(variants[0]!.rule_id);
  const [executionDate, setExecutionDate] = React.useState(todayISO());
  const [file, setFile] = React.useState<File | null>(null);
  const [pageCount, setPageCount] = React.useState("1");
  const [retentionDays, setRetentionDays] = React.useState<"0" | "30">("30");
  const [consent, setConsent] = React.useState(false);
  const [job, setJob] = React.useState<Job | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [reviewed, setReviewed] = React.useState<Record<string, boolean>>({});
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [refusal, setRefusal] = React.useState<ComputationRefusal | null>(null);
  const [output, setOutput] = React.useState<ComputeOutput | null>(null);
  const [recordId, setRecordId] = React.useState<string | null>(null);
  const fields = React.useMemo(() => fieldsForRuleAtDate(ruleId, executionDate), [ruleId, executionDate]);
  const fieldByKey = React.useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields]);

  function changeState(next: StateCode) {
    const nextVariants = CATALOG[next].flatMap((instrument) => instrument.variants);
    setState(next);
    setRuleId(nextVariants[0]!.rule_id);
    resetResult();
  }

  function resetResult() {
    setJob(null);
    setDraft(null);
    setValues({});
    setReviewed({});
    setMessage(null);
    setRefusal(null);
    setOutput(null);
    setRecordId(null);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    resetResult();
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("jurisdiction", state);
      form.set("rule_id", ruleId);
      form.set("execution_date", executionDate);
      form.set("page_count", pageCount);
      form.set("retention_days", retentionDays);
      form.set("consent_to_process", String(consent));
      const response = await fetch("/api/extractions", { method: "POST", body: form });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? "document extraction could not start");
      setJob(body.job);
      if (body.job.status !== "completed") {
        setMessage(`Extraction ended with status ${body.job.status}. No document text entered the audit log.`);
        return;
      }
      const draftResponse = await fetch(`/api/extractions/${encodeURIComponent(body.job.id)}`, { cache: "no-store" });
      const draftBody = await draftResponse.json();
      if (!draftBody.ok) throw new Error(draftBody.error ?? "extraction draft is unavailable");
      const nextDraft = draftBody.draft as Draft;
      setDraft(nextDraft);
      setValues(Object.fromEntries(nextDraft.fields.map((field) => [field.key, field.proposed_value ?? ""])));
      setReviewed(Object.fromEntries(nextDraft.fields.map((field) => [field.key, false])));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "document extraction could not be completed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAndCompute() {
    if (!draft || !job) return;
    setBusy(true);
    setMessage(null);
    setRefusal(null);
    setOutput(null);
    try {
      const confirmation = {
        draft_id: draft.draft_id,
        fields: draft.fields.map((field) => {
          const confirmedValue = (values[field.key] ?? "").trim() || null;
          return {
            key: field.key,
            kind: field.kind,
            confirmed_value: confirmedValue,
            disposition: confirmedValue === null
              ? "not_applicable"
              : field.status === "not_found"
                ? "entered"
                : confirmedValue === field.proposed_value
                  ? "accepted"
                  : "edited",
          };
        }),
      };
      const response = await fetch(`/api/extractions/${encodeURIComponent(job.id)}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation, ...(matterId ? { matter_id: matterId } : {}) }),
      });
      const body = await response.json();
      if (body.ok) {
        setOutput(body.output);
        setRecordId(body.recordId);
        setJob(body.job);
        setMessage(body.job.document_state === "deleted"
          ? "Confirmed values were recorded; the document and every source snippet were deleted."
          : "Confirmed values were recorded. The document remains under its 30-day retention policy.");
      } else if (body.refusal) {
        setRefusal(body.refusal);
      } else {
        throw new Error(body.error ?? "confirmed computation could not be completed");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : unavailableRefusal().message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument() {
    if (!job) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/extractions/${encodeURIComponent(job.id)}`, { method: "DELETE" });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? "document deletion failed");
      setJob(body.job);
      setDraft(null);
      setValues({});
      setReviewed({});
      setMessage("The document and its source snippets were deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "document deletion failed");
    } finally {
      setBusy(false);
    }
  }

  const reviewComplete = Boolean(draft) && draft!.fields.every((field) => {
    const contractField = fieldByKey.get(field.key);
    return reviewed[field.key] && (contractField?.optional || Boolean((values[field.key] ?? "").trim()));
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif"><FileSearch className="h-5 w-5 text-gold" />Document intake</CardTitle>
          <CardDescription>PDF or DOCX, up to 20 MB and 60 pages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="document-state">Jurisdiction</Label>
            <select id="document-state" value={state} onChange={(event) => changeState(event.target.value as StateCode)} className="flex h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="DL">Delhi</option><option value="MH">Maharashtra</option><option value="KA">Karnataka</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="document-rule">Instrument</Label>
            <select id="document-rule" value={ruleId} onChange={(event) => { setRuleId(event.target.value); resetResult(); }} className="flex h-10 w-full rounded-md border bg-background px-3 text-sm">
              {variants.map((variant) => <option key={variant.rule_id} value={variant.rule_id}>{variant.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="document-date">Execution date</Label><Input id="document-date" type="date" min="2015-01-01" value={executionDate} onChange={(event) => { setExecutionDate(event.target.value); resetResult(); }} /></div>
          <div className="space-y-1.5"><Label htmlFor="document-file">Document</Label><Input id="document-file" type="file" accept="application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="document-pages">Page count</Label><Input id="document-pages" type="number" min="1" max="60" value={pageCount} onChange={(event) => setPageCount(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="document-retention">Retention</Label><select id="document-retention" value={retentionDays} onChange={(event) => setRetentionDays(event.target.value as "0" | "30")} className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="30">30 days</option><option value="0">Compute and delete</option></select></div>
          </div>
          <label className="flex items-start gap-2.5 rounded-md border bg-muted/20 p-3 text-sm leading-relaxed">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
            <span>I consent to processing this document solely to extract the selected rule&apos;s fields. Provider storage must be encrypted, India-resident, excluded from training, and deleted under the selected policy.</span>
          </label>
          <Button type="button" className="w-full" onClick={upload} disabled={busy || !file || !consent || Number(pageCount) < 1 || Number(pageCount) > 60} aria-busy={busy}>{busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Extract required fields</Button>
          {job && job.status !== "deleted" && <Button type="button" variant="outline" className="w-full" onClick={deleteDocument} disabled={busy}><Trash2 />Delete document now</Button>}
        </CardContent>
      </Card>

      <div className="space-y-4" aria-live="polite" aria-busy={busy}>
        {message && <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm">{message}</div>}
        {refusal && <EscalationCard refusal={refusal} />}
        {draft && !output && (
          <Card>
            <CardHeader><CardTitle className="font-serif">Confirm every extracted field</CardTitle><CardDescription>Model {draft.model_version}. Source snippets disappear with the document and are never written to the computation audit.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {draft.fields.map((field) => {
                const definition = fieldByKey.get(field.key);
                return <div key={field.key} className="space-y-2 rounded-md border p-3">
                  <Label htmlFor={`confirmed-${field.key}`}>{definition?.label ?? field.key}{!definition?.optional && <span className="text-destructive"> *</span>}</Label>
                  <Input id={`confirmed-${field.key}`} value={values[field.key] ?? ""} onChange={(event) => { setValues((current) => ({ ...current, [field.key]: event.target.value })); setReviewed((current) => ({ ...current, [field.key]: false })); }} />
                  {field.source ? <blockquote className="border-l-2 pl-3 text-xs leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Page {field.source.page}:</span> {field.source.snippet}</blockquote> : <p className="text-xs text-amber-700">Not found by the provider. Enter the value or explicitly mark an optional field reviewed.</p>}
                  <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={reviewed[field.key] ?? false} onChange={(event) => setReviewed((current) => ({ ...current, [field.key]: event.target.checked }))} className="h-4 w-4 accent-primary" />I checked this value against the document.</label>
                </div>;
              })}
              <Button type="button" className="w-full" onClick={confirmAndCompute} disabled={busy || !reviewComplete}>{busy ? <Loader2 className="animate-spin" /> : null}{reviewComplete ? "Confirm and compute" : "Review every required field"}</Button>
            </CardContent>
          </Card>
        )}
        {output && <DutyResult output={output} memoHref={recordId ? `/api/computations/memo?recordId=${encodeURIComponent(recordId)}` : undefined} />}
        {!draft && !output && !refusal && !message && <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">The page-referenced confirmation form appears here after extraction.</div>}
      </div>
    </div>
  );
}
