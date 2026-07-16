"use client";

import * as React from "react";
import Link from "next/link";
import type { ComputeOutput } from "@stampdraft/schema";
import { inr, formatDate, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BookOpenText, Copy, Check, FileText, ShieldAlert, TriangleAlert } from "lucide-react";

function HashChip({ hash }: { hash: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(hash).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="group inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted"
      title="Ruleset identity — the computation is reproducible from inputs + this hash"
    >
      <span className="truncate">{hash.slice(0, 26)}…</span>
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 opacity-60 group-hover:opacity-100" />}
    </button>
  );
}

const KIND_LABEL: Record<string, { label: string; cls: string }> = {
  base_duty: { label: "Stamp duty", cls: "bg-primary/10 text-primary border-primary/20" },
  surcharge_cess: { label: "Surcharge / cess", cls: "bg-sky-600/10 text-sky-700 border-sky-600/20" },
  concession: { label: "Concession", cls: "bg-emerald-600/10 text-emerald-700 border-emerald-600/20" },
  rounding: { label: "Rounding", cls: "bg-muted text-muted-foreground border-border" },
};

export function EscalationCard({ message }: { message: string }) {
  return (
    <Alert variant="warning" className="animate-fade-up">
      <ShieldAlert />
      <AlertTitle className="font-serif text-base">Escalation required — the engine will not guess</AlertTitle>
      <AlertDescription className="space-y-2 text-muted-foreground">
        <p className="font-medium text-foreground">{message}</p>
        <p>
          Either a required input is missing, or this scenario sits outside the verified encoding. Supply the
          missing detail, or treat this as a genuine grey zone: apply s.6 (highest of the competing duties) and
          consider adjudication under s.31 before execution.
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function DutyResult({
  output,
  memoHref,
  compact = false,
}: {
  output: ComputeOutput;
  memoHref?: string;
  compact?: boolean;
}) {
  return (
    <div className="animate-fade-up space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b bg-primary px-6 py-5 text-primary-foreground">
          <p className="text-xs font-medium uppercase tracking-widest opacity-70">Total duty payable</p>
          <p className="tabular mt-1 font-serif text-4xl font-semibold tracking-tight">{inr(output.total_duty)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-80">
            <span>
              {output.act} · Art. {output.article}
            </span>
            <span>Executed {formatDate(output.execution_date)}</span>
          </div>
        </div>
        <CardContent className="pt-5">
          {output.warnings.length > 0 && (
            <Alert variant="warning" className="mb-4">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>
                The figure stands, but {output.warnings.length === 1 ? "a caveat applies" : "caveats apply"}
              </AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {output.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-0">
            {output.breakup.map((line, i) => {
              const k = KIND_LABEL[line.kind] ?? KIND_LABEL.base_duty;
              return (
                <div key={i} className={cn("flex items-center justify-between gap-4 py-2.5", i > 0 && "border-t")}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", k.cls)}>
                      {k.label}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">{line.label}</span>
                  </div>
                  <span className={cn("tabular shrink-0 text-sm font-semibold", line.amount.startsWith("-") && "text-emerald-700")}>
                    {inr(line.amount)}
                  </span>
                </div>
              );
            })}
          </div>

          <Separator className="my-4" />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {output.verified_as_of ? (
                <Badge variant="success">Verified {formatDate(output.verified_as_of)}</Badge>
              ) : (
                <Badge variant="gold">
                  <TriangleAlert className="mr-1 h-3 w-3" />
                  Draft encoding — pending verification
                </Badge>
              )}
              <HashChip hash={output.rules_version} />
            </div>
            {memoHref && (
              <Button asChild size="sm" variant="gold">
                <Link href={memoHref} target="_blank">
                  <FileText />
                  Export memo
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {output.penalty && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg">Deficit &amp; penalty</CardTitle>
            <CardDescription>As-of computation against duty actually paid</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Deficit</p>
                <p className="tabular mt-0.5 font-semibold">{inr(output.penalty.deficit)}</p>
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Penalty</p>
                <p className="tabular mt-0.5 font-semibold">
                  {output.penalty.penalty_point !== null
                    ? inr(output.penalty.penalty_point)
                    : output.penalty.penalty_range
                      ? `${inr(output.penalty.penalty_range.min)} – ${inr(output.penalty.penalty_range.max)}`
                      : "—"}
                </p>
              </div>
              <div className="col-span-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:col-span-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-destructive/80">Total payable</p>
                <p className="tabular mt-0.5 font-semibold text-destructive">
                  {output.penalty.total_payable_point !== null
                    ? inr(output.penalty.total_payable_point)
                    : output.penalty.total_payable_range
                      ? `${inr(output.penalty.total_payable_range.min)} – ${inr(output.penalty.total_payable_range.max)}`
                      : "—"}
                </p>
              </div>
            </div>
            {output.penalty.penalty_range && (
              <p className="text-xs text-muted-foreground">
                This state&apos;s penalty is discretionary — the law fixes a ceiling, not a number, so StampDraft
                reports the statutory range rather than a false point estimate.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Adjudication path:</span> {output.penalty.adjudication_path}
            </p>
          </CardContent>
        </Card>
      )}

      {!compact && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 font-serif text-lg">
              <BookOpenText className="h-4 w-4 text-gold" />
              Legal sources ({output.citations.length})
            </CardTitle>
            <CardDescription>Every figure above traces to the statutory text below.</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {output.citations.map((c, i) => (
                <AccordionItem key={i} value={`c${i}`}>
                  <AccordionTrigger className="gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge variant="secondary" className="shrink-0 uppercase">{c.type.replace("_", " ")}</Badge>
                      <span className="truncate text-left">{c.ref}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <blockquote className="border-l-2 border-gold/60 pl-3 text-[13px] leading-relaxed text-muted-foreground">
                      {c.quoted_text}
                    </blockquote>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {c.gazette_date && <span>Gazette: {formatDate(c.gazette_date)}</span>}
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">
                          Source document
                        </a>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
