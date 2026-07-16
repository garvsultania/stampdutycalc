import Link from "next/link";
import { getCorpus, STATES } from "@/lib/rules-server";
import { CATALOG } from "@/lib/manifest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ArrowRight, BookOpenText, CalendarClock, FileCheck2, GitBranch, Landmark, Ruler, Scale, ShieldCheck, Sigma,
} from "lucide-react";

export default function Home() {
  const { corpus, perState } = getCorpus();
  const totalVersions = corpus.ruleSet.rules.length + corpus.ruleSet.modifiers.length + corpus.ruleSet.penaltyRegimes.length;

  return (
    <>
      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-secondary/60 to-background">
        <div className="container flex flex-col items-center py-20 text-center md:py-28">
          <Badge variant="gold" className="mb-5">Delhi · Maharashtra · Karnataka</Badge>
          <h1 className="max-w-3xl font-serif text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            The computable law of <span className="text-gold">stamp duty</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
            India&apos;s stamp law is scattered across Acts, amendments and gazette notifications. StampDraft
            consolidates it into versioned, citation-backed rules — and computes on top, deterministically.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/compute">Compute a duty <ArrowRight /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/classify">Classify an instrument</Link>
            </Button>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-x-10 gap-y-4 text-sm md:grid-cols-4">
            {[
              { icon: Sigma, label: "Zero LLM in the computation path" },
              { icon: BookOpenText, label: "Every figure statute-cited" },
              { icon: GitBranch, label: "Append-only versioned law" },
              { icon: ShieldCheck, label: `${totalVersions} rule versions · 166 golden tests` },
            ].map((t) => (
              <div key={t.label} className="flex items-center gap-2 text-muted-foreground">
                <t.icon className="h-4 w-4 shrink-0 text-gold" />
                <span className="text-left text-xs font-medium md:text-sm">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* States */}
      <section className="container py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-serif text-2xl font-semibold tracking-tight md:text-3xl">Three statutes, one engine</h2>
            <p className="mt-1 text-sm text-muted-foreground">Each state is encoded from its own Act — never generalized.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {STATES.map((s) => {
            const st = perState[s.code];
            return (
              <Link key={s.code} href={`/compute?state=${s.code}`} className="group">
                <Card className="h-full transition-all group-hover:border-primary/50 group-hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary font-serif text-sm font-semibold text-primary-foreground">
                        {s.code}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <CardTitle className="pt-3 font-serif text-xl">{s.name}</CardTitle>
                    <CardDescription>{s.act}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary">{st.ruleSet.rules.length} rule versions</Badge>
                    <Badge variant="secondary">{CATALOG[s.code].length} instruments</Badge>
                    <Badge variant="secondary">2015 → today</Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Capabilities */}
      <section className="border-t bg-secondary/40">
        <div className="container py-16">
          <h2 className="font-serif text-2xl font-semibold tracking-tight md:text-3xl">Built for the matter file</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Not a lead-gen calculator. A defensible computation with the provenance a professional puts on record.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Landmark, title: "Instrument-first", body: "Conveyance, leases, gifts, mortgages, POAs, bonds, partnerships, works contracts, share transfers — not just property." },
              { icon: CalendarClock, title: "Historical mode", body: "The law as on any execution date since 2015. A 2016 Maharashtra lease computes at 2016 rates, automatically." },
              { icon: Ruler, title: "Penalty ranges, honestly", body: "Discretionary regimes report the statutory range — never a fabricated point estimate. Per-month regimes compute exactly." },
              { icon: Scale, title: "Classification trees", body: "Lease vs leave & license, works vs service — the legal tests as guided questions. Grey zones escalate, never guess." },
              { icon: BookOpenText, title: "Citations inline", body: "Every line of the breakup carries its Act, Article and notification — quoted verbatim from the source." },
              { icon: FileCheck2, title: "Filed-ready memo", body: "One click to a print-ready memo: inputs, breakup, citations, verification status and the ruleset hash." },
            ].map((f) => (
              <Card key={f.title}>
                <CardHeader>
                  <f.icon className="h-5 w-5 text-gold" />
                  <CardTitle className="pt-2 text-base">{f.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{f.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Positioning */}
      <section className="container py-14">
        <div className="mx-auto max-w-3xl rounded-lg border bg-card p-8 text-center shadow-sm">
          <p className="font-serif text-lg leading-relaxed text-muted-foreground">
            “Same inputs, same ruleset hash, same output —{" "}
            <span className="text-foreground">byte for byte, every time.</span>{" "}
            The moat is the data: consolidated, versioned, citation-backed law.”
          </p>
          <p className="mt-4 text-xs uppercase tracking-widest text-muted-foreground">
            StampDraft outputs computation reports, not legal opinions
          </p>
        </div>
      </section>
    </>
  );
}
