"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowRight, CheckCircle2, RotateCcw, Scale, ShieldAlert, Gavel } from "lucide-react";

export interface TreeMeta {
  tree_id: string;
  jurisdiction: string;
  instrument_class: string;
  title: string;
  description: string;
}

type StepState =
  | { status: "incomplete"; node: string; question: string; legal_test: string; options: string[] }
  | { status: "resolved"; instrument: string; article: string; rule_id: string }
  | { status: "escalate"; reason: string };

export function ClassifyWizard({ trees }: { trees: TreeMeta[] }) {
  const [treeId, setTreeId] = React.useState<string | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [trail, setTrail] = React.useState<{ question: string; answer: string }[]>([]);
  const [step, setStep] = React.useState<StepState | null>(null);
  const [busy, setBusy] = React.useState(false);

  const tree = trees.find((t) => t.tree_id === treeId) ?? null;

  async function advance(nextAnswers: Record<string, string>, id = treeId) {
    if (!id) return;
    setBusy(true);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tree_id: id, answers: nextAnswers }),
      });
      const data = await res.json();
      if (data.ok) setStep(data.result);
    } finally {
      setBusy(false);
    }
  }

  function start(id: string) {
    setTreeId(id);
    setAnswers({});
    setTrail([]);
    setStep(null);
    void advance({}, id);
  }

  function answer(option: string) {
    if (!step || step.status !== "incomplete") return;
    const next = { ...answers, [step.node]: option };
    setAnswers(next);
    setTrail((t) => [...t, { question: step.question, answer: option }]);
    void advance(next);
  }

  function reset() {
    setTreeId(null);
    setAnswers({});
    setTrail([]);
    setStep(null);
  }

  if (!tree) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {trees.map((t) => (
          <button key={t.tree_id} onClick={() => start(t.tree_id)} className="group text-left">
            <Card className="h-full transition-all group-hover:border-primary/50 group-hover:shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{t.jurisdiction}</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <CardTitle className="pt-2 font-serif text-lg">{t.title}</CardTitle>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
            </Card>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{tree.jurisdiction}</Badge>
          <span className="font-serif text-lg font-semibold">{tree.title}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={reset}><RotateCcw /> Start over</Button>
      </div>

      {trail.length > 0 && (
        <ol className="space-y-1.5">
          {trail.map((t, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span className="text-muted-foreground">{t.question}</span>
              <span className="ml-auto shrink-0 font-semibold capitalize">{t.answer}</span>
            </li>
          ))}
        </ol>
      )}

      {step?.status === "incomplete" && (
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle className="font-serif text-xl leading-snug">{step.question}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border-l-2 border-gold/60 bg-muted/30 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold">
                <Gavel className="h-3 w-3" /> The legal test
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{step.legal_test}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {step.options.map((o) => (
                <Button key={o} variant="outline" size="lg" disabled={busy} onClick={() => answer(o)} className="justify-between capitalize">
                  {o} <ArrowRight className="text-muted-foreground" />
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {step?.status === "resolved" && (
        <Card className="animate-fade-up border-emerald-600/30">
          <CardHeader>
            <Badge variant="success" className="w-fit">Classification resolved</Badge>
            <CardTitle className="pt-2 font-serif text-2xl capitalize">
              {step.instrument.replace(/_/g, " ")}
            </CardTitle>
            <CardDescription>Article {step.article} · rule {step.rule_id}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg">
              <Link href={`/compute?state=${tree.jurisdiction}&rule=${step.rule_id}`}>
                <Scale /> Compute the duty
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {step?.status === "escalate" && (
        <Alert variant="warning" className="animate-fade-up">
          <ShieldAlert />
          <AlertTitle className="font-serif text-base">Grey zone — professional judgment required</AlertTitle>
          <AlertDescription className="space-y-2 text-muted-foreground">
            <p className="font-medium text-foreground">{step.reason}</p>
            <p>
              StampDraft escalates rather than misclassifies. Consider s.6 (the instrument bears the highest of the
              competing duties) and adjudication under s.31 before execution.
            </p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
