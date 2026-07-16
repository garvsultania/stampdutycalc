"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { ComputeOutput } from "@stampdraft/schema";
import { CATALOG, type InstrumentDef, type Field } from "@/lib/manifest";
import { todayISO, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { DutyResult, EscalationCard } from "@/components/duty-result";
import { Landmark, Loader2, CalendarClock, IndianRupee, Sparkles, FolderCheck } from "lucide-react";

type StateCode = "DL" | "MH" | "KA";
const STATES: { code: StateCode; name: string; act: string }[] = [
  { code: "DL", name: "Delhi", act: "Indian Stamp Act, 1899 · Schedule I-A" },
  { code: "MH", name: "Maharashtra", act: "Maharashtra Stamp Act, 1958" },
  { code: "KA", name: "Karnataka", act: "Karnataka Stamp Act, 1957" },
];

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === "select" && field.options) {
    return (
      <div className="space-y-1.5">
        <Label>{field.label}{!field.optional && <span className="text-destructive"> *</span>}</Label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label>{field.label}{!field.optional && <span className="text-destructive"> *</span>}</Label>
      <div className="relative">
        {field.type === "money" && (
          <IndianRupee className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          inputMode="numeric"
          className={cn("tabular", field.type === "money" && "pl-8")}
          placeholder={field.type === "months" ? "e.g. 36" : "e.g. 5000000"}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        />
      </div>
      {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
    </div>
  );
}

export function ComputeWorkspace() {
  const params = useSearchParams();

  const initialState = (params.get("state") as StateCode) || "DL";
  const [state, setState] = React.useState<StateCode>(STATES.some((s) => s.code === initialState) ? initialState : "DL");
  const catalog = CATALOG[state];

  const ruleParam = params.get("rule");
  const initialInstrument =
    (ruleParam && catalog.find((i) => i.variants.some((v) => v.rule_id === ruleParam))?.slug) ||
    params.get("instrument") ||
    catalog[0].slug;

  const [slug, setSlug] = React.useState(initialInstrument);
  const instrument: InstrumentDef = catalog.find((i) => i.slug === slug) ?? catalog[0];

  const initialVariant = ruleParam
    ? Math.max(0, instrument.variants.findIndex((v) => v.rule_id === ruleParam))
    : 0;
  const [variantIdx, setVariantIdx] = React.useState(initialVariant);
  const variant = instrument.variants[Math.min(variantIdx, instrument.variants.length - 1)];

  const [inputs, setInputs] = React.useState<Record<string, string>>({});
  const [executionDate, setExecutionDate] = React.useState(todayISO());
  const [adjudication, setAdjudication] = React.useState(false);
  const [dutyPaid, setDutyPaid] = React.useState("");
  const [penaltyMonths, setPenaltyMonths] = React.useState("");

  const matterId = params.get("matter");
  const [busy, setBusy] = React.useState(false);
  const [output, setOutput] = React.useState<ComputeOutput | null>(null);
  const [filed, setFiled] = React.useState(false);
  const [escalation, setEscalation] = React.useState<string | null>(null);
  const [lastPayload, setLastPayload] = React.useState<string | null>(null);

  const switchState = (code: StateCode) => {
    setState(code);
    setSlug(CATALOG[code][0].slug);
    setVariantIdx(0);
    setInputs({});
    setOutput(null);
    setEscalation(null);
  };
  const switchInstrument = (s: string) => {
    setSlug(s);
    setVariantIdx(0);
    setInputs({});
    setOutput(null);
    setEscalation(null);
  };

  const missing = variant.fields.filter((f) => !f.optional && !(inputs[f.key] ?? "").trim());

  async function run() {
    setBusy(true);
    setOutput(null);
    setEscalation(null);
    setFiled(false);
    const values: Record<string, string> = {};
    const facts: Record<string, string> = {};
    for (const f of variant.fields) {
      const raw = (inputs[f.key] ?? "").trim();
      if (!raw) continue;
      if (f.kind === "value") values[f.key] = raw;
      else facts[f.key] = raw;
    }
    const payload = {
      input: {
        jurisdiction: state,
        rule_id: variant.rule_id,
        execution_date: executionDate,
        values,
        facts,
        ...(adjudication && dutyPaid ? { duty_paid: dutyPaid } : {}),
      },
      ...(adjudication && penaltyMonths ? { penaltyMonths: Number(penaltyMonths) } : {}),
    };
    try {
      // Inside a matter, the computation is FILED: computed and written to the
      // append-only audit log in one step, so what the lawyer saw is what is recorded.
      const res = await fetch(matterId ? "/api/computations" : "/api/compute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(matterId ? { ...payload, matterId } : payload),
      });
      const data = await res.json();
      if (data.ok) {
        setOutput(data.output);
        setFiled(Boolean(data.recordId));
        setLastPayload(btoa(encodeURIComponent(JSON.stringify(payload))));
      } else {
        setEscalation(data.escalation ?? data.error ?? "Computation failed");
      }
    } catch {
      setEscalation("Could not reach the computation engine.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ——— Left: the matter ——— */}
      <div className="space-y-4">
        {matterId && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-xs">
            <FolderCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <p className="text-muted-foreground">
              Filing to a matter — this computation will be written to the{" "}
              <span className="font-semibold text-foreground">immutable audit log</span>.
            </p>
          </div>
        )}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 font-serif text-lg">
              <Landmark className="h-4 w-4 text-gold" /> Jurisdiction &amp; instrument
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {STATES.map((s) => (
                <button
                  key={s.code}
                  onClick={() => switchState(s.code)}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left transition-all",
                    state === s.code
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "bg-card hover:border-primary/40"
                  )}
                >
                  <span className="block text-sm font-semibold">{s.name}</span>
                  <span className={cn("mt-0.5 block text-[10px] leading-tight", state === s.code ? "opacity-70" : "text-muted-foreground")}>
                    {s.act}
                  </span>
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Instrument</Label>
              <Select value={slug} onValueChange={switchInstrument}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {catalog.map((i) => (
                    <SelectItem key={i.slug} value={i.slug}>
                      {i.name} <span className="text-muted-foreground">· {i.article}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-relaxed text-muted-foreground">{instrument.summary}</p>
            </div>

            {instrument.variants.length > 1 && (
              <div className="space-y-2">
                <Label>Variant</Label>
                <RadioGroup
                  value={String(variantIdx)}
                  onValueChange={(v) => { setVariantIdx(Number(v)); setOutput(null); setEscalation(null); }}
                  className="gap-1.5"
                >
                  {instrument.variants.map((v, i) => (
                    <label
                      key={v.rule_id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors",
                        variantIdx === i ? "border-primary/50 bg-accent" : "hover:bg-accent/50"
                      )}
                    >
                      <RadioGroupItem value={String(i)} className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-medium">{v.label}</span>
                        {v.description && <span className="block text-xs text-muted-foreground">{v.description}</span>}
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 font-serif text-lg">
              <Sparkles className="h-4 w-4 text-gold" /> Facts of the matter
            </CardTitle>
            <CardDescription>Only what the statute needs — nothing else.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {variant.fields.length === 0 && (
              <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                Fixed duty — no inputs required.
              </p>
            )}
            {variant.fields.map((f) => (
              <FieldInput key={f.key} field={f} value={inputs[f.key] ?? ""} onChange={(v) => setInputs((p) => ({ ...p, [f.key]: v }))} />
            ))}

            <Separator />

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Execution date</Label>
              <Input type="date" value={executionDate} min="2015-01-01" onChange={(e) => setExecutionDate(e.target.value)} className="tabular" />
              <p className="text-xs text-muted-foreground">
                The law <em>as on this date</em> applies — pick a past date for historical / adjudication work (2015 onwards).
              </p>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-md border p-3">
              <input type="checkbox" checked={adjudication} onChange={(e) => setAdjudication(e.target.checked)} className="h-4 w-4 accent-primary" />
              <span className="text-sm font-medium">Deficit &amp; penalty (adjudication mode)</span>
            </label>
            {adjudication && (
              <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
                <div className="space-y-1.5">
                  <Label>Duty actually paid</Label>
                  <Input inputMode="numeric" className="tabular" value={dutyPaid} onChange={(e) => setDutyPaid(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Months since execution</Label>
                  <Input inputMode="numeric" className="tabular" value={penaltyMonths} onChange={(e) => setPenaltyMonths(e.target.value.replace(/[^\d]/g, ""))} placeholder="Required for per-month regimes" />
                </div>
              </div>
            )}

            <Button onClick={run} disabled={busy || missing.length > 0} className="w-full" size="lg">
              {busy ? <Loader2 className="animate-spin" /> : null}
              {missing.length > 0 ? `Provide: ${missing.map((m) => m.label).join(", ")}` : "Compute duty"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ——— Right: the result ——— */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        {escalation && <EscalationCard message={escalation} />}
        {filed && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-xs animate-fade-up">
            <FolderCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <p className="text-muted-foreground">
              Filed to the audit log — replayable from its inputs and ruleset hash.{" "}
              <a href={`/workspace/${matterId}`} className="font-semibold text-foreground underline underline-offset-2">
                View matter
              </a>
            </p>
          </div>
        )}
        {output && <DutyResult output={output} memoHref={lastPayload ? `/memo?d=${lastPayload}` : undefined} />}
        {!output && !escalation && (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border bg-card shadow-sm">
              <IndianRupee className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-4 font-serif text-lg font-medium">The duty appears here</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Line-by-line breakup, statutory citations, and the ruleset hash that makes it reproducible.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
