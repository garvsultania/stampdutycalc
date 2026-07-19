import { compute } from "@stampdraft/engine";
import { getCorpus } from "@/lib/rules-server";
import { inr, formatDate } from "@/lib/utils";
import { PrintButton } from "@/components/print-button";
import { Scale } from "lucide-react";
import { indiaTodayISO } from "@/lib/legal-date";

export const metadata = { title: "Computation memo — StampDraft" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = {
  base_duty: "Stamp duty",
  surcharge_cess: "Surcharge / cess",
  concession: "Concession",
  rounding: "Rounding",
};

function labelize(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MemoPage({ searchParams }: { searchParams: { d?: string } }) {
  if (!searchParams.d) {
    return <div className="container py-20 text-center text-muted-foreground">No computation supplied.</div>;
  }

  let payload: { input: Parameters<typeof compute>[1]; penaltyMonths?: number };
  try {
    payload = JSON.parse(decodeURIComponent(Buffer.from(searchParams.d, "base64").toString("utf8")));
  } catch {
    return <div className="container py-20 text-center text-muted-foreground">Malformed memo link.</div>;
  }

  // Recomputed server-side from the recorded inputs — the memo IS the reproducibility claim.
  const { corpus } = getCorpus();
  let output;
  try {
    output = compute(corpus.ruleSet, payload.input, {
      penaltyMonths: payload.penaltyMonths,
      requireVerified: process.env.NODE_ENV === "production",
      requireEvidence: process.env.NODE_ENV === "production",
      evidenceAsOf: indiaTodayISO(),
    });
  } catch (e) {
    return (
      <div className="container py-20 text-center text-muted-foreground">
        This computation now escalates under the current ruleset: {(e as Error).message}
      </div>
    );
  }

  const generatedOn = new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" });

  return (
    <div className="bg-muted/40 py-10 print:py-0">
      <div className="no-print container mb-6 flex max-w-3xl items-center justify-between">
        <p className="text-sm text-muted-foreground">Print to PDF for the matter file — the memo carries everything needed to reproduce it.</p>
        <PrintButton />
      </div>

      <div className="memo-sheet container max-w-3xl rounded-lg border bg-white p-10 shadow-sm">
        {/* Letterhead */}
        <div className="flex items-start justify-between border-b-2 border-primary pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
                <Scale className="h-4 w-4" />
              </span>
              <span className="font-serif text-2xl font-semibold tracking-tight">StampDraft</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Stamp duty computation memorandum</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Generated {generatedOn}</p>
            <p className="mt-0.5">
              Verification:{" "}
              {output.verified_as_of ? (
                <span className="font-medium text-emerald-700">verified {formatDate(output.verified_as_of)}</span>
              ) : (
                <span className="font-medium text-gold">draft encoding — pending verification</span>
              )}
            </p>
          </div>
        </div>

        {/* Matter */}
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">The instrument</h2>
          <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
            <p><span className="text-muted-foreground">Instrument:</span> <span className="font-medium capitalize">{output.instrument.replace(/_/g, " ")}</span></p>
            <p><span className="text-muted-foreground">Jurisdiction:</span> <span className="font-medium">{output.jurisdiction}</span></p>
            <p className="col-span-2"><span className="text-muted-foreground">Charging provision:</span> <span className="font-medium">{output.act}, Art. {output.article}</span></p>
            <p><span className="text-muted-foreground">Execution date:</span> <span className="font-medium">{formatDate(output.execution_date)}</span></p>
            <p><span className="text-muted-foreground">Rule:</span> <span className="font-mono text-xs">{output.rule_id}</span></p>
          </div>
        </section>

        {/* Inputs */}
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Inputs as confirmed</h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {Object.entries(output.inputs_echo.values).map(([k, v]) => (
                <tr key={k} className="border-b border-dashed last:border-0">
                  <td className="py-1.5 text-muted-foreground">{labelize(k)}</td>
                  <td className="tabular py-1.5 text-right font-medium">{inr(String(v))}</td>
                </tr>
              ))}
              {Object.entries(output.inputs_echo.facts).map(([k, v]) => (
                <tr key={k} className="border-b border-dashed last:border-0">
                  <td className="py-1.5 text-muted-foreground">{labelize(k)}</td>
                  <td className="py-1.5 text-right font-medium capitalize">{String(v).replace(/_/g, " ")}</td>
                </tr>
              ))}
              {output.inputs_echo.duty_paid !== undefined && (
                <tr className="border-b border-dashed last:border-0">
                  <td className="py-1.5 text-muted-foreground">Duty actually paid</td>
                  <td className="tabular py-1.5 text-right font-medium">{inr(String(output.inputs_echo.duty_paid))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Breakup */}
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Computation</h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {output.breakup.map((l, i) => (
                <tr key={i} className="border-b border-dashed">
                  <td className="py-2 text-muted-foreground">{KIND[l.kind]}</td>
                  <td className="py-2">{l.label}</td>
                  <td className="tabular py-2 text-right font-medium">{inr(l.amount)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} className="py-3 font-serif text-base font-semibold">Total duty payable</td>
                <td className="tabular py-3 text-right font-serif text-xl font-semibold">{inr(output.total_duty)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Penalty */}
        {output.penalty && (
          <section className="mt-6 rounded-md border border-gold/40 bg-gold/5 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Deficit &amp; penalty (as-of computation)</h2>
            <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
              <p><span className="block text-xs text-muted-foreground">Deficit</span><span className="tabular font-semibold">{inr(output.penalty.deficit)}</span></p>
              <p>
                <span className="block text-xs text-muted-foreground">Penalty</span>
                <span className="tabular font-semibold">
                  {output.penalty.penalty_point !== null
                    ? inr(output.penalty.penalty_point)
                    : output.penalty.penalty_range
                      ? `${inr(output.penalty.penalty_range.min)} – ${inr(output.penalty.penalty_range.max)}`
                      : "—"}
                </span>
              </p>
              <p>
                <span className="block text-xs text-muted-foreground">Total payable</span>
                <span className="tabular font-semibold">
                  {output.penalty.total_payable_point !== null
                    ? inr(output.penalty.total_payable_point)
                    : output.penalty.total_payable_range
                      ? `${inr(output.penalty.total_payable_range.min)} – ${inr(output.penalty.total_payable_range.max)}`
                      : "—"}
                </span>
              </p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {output.penalty.penalty_range && "Discretionary regime — the statutory range is reported; no point estimate exists in law. "}
              Adjudication path: {output.penalty.adjudication_path}
            </p>
          </section>
        )}

        {/* Citations */}
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Legal sources</h2>
          <ol className="mt-2 list-decimal space-y-3 pl-5 text-sm">
            {output.citations.map((c, i) => (
              <li key={i}>
                <p className="font-medium">{c.ref}</p>
                <blockquote className="mt-1 border-l-2 border-gold/50 pl-3 text-[13px] leading-relaxed text-muted-foreground">
                  {c.quoted_text}
                </blockquote>
                {c.gazette_date && <p className="mt-1 text-xs text-muted-foreground">Gazette date: {formatDate(c.gazette_date)}</p>}
              </li>
            ))}
          </ol>
        </section>

        {/* Provenance footer */}
        <section className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">Ruleset identity:</span>{" "}
            <span className="break-all font-mono">{output.rules_version}</span>
          </p>
          <p className="mt-2 leading-relaxed">
            This memorandum is a deterministic computation over the versioned rule corpus identified by the hash
            above: identical inputs and ruleset reproduce it byte for byte. It is a computation report on the law
            as published, not a legal opinion; professional judgment and, where indicated, adjudication under the
            applicable Stamp Act remain with the practitioner.
          </p>
        </section>
      </div>
    </div>
  );
}
