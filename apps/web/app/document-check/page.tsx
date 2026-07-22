import { Suspense } from "react";
import { DocumentCheck } from "@/components/document-check";

export default function DocumentCheckPage() {
  return (
    <div className="container py-8 md:py-12">
      <div className="mb-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold">Tier 2 · confirmed extraction</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">Check a document</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Extract only the selected rule&apos;s required fields, verify every value against its page and source
          snippet, then send the confirmed values—not the document text—into the deterministic engine.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading document check…</p>}>
        <DocumentCheck />
      </Suspense>
    </div>
  );
}
