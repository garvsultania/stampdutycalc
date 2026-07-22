import { Suspense } from "react";
import { ComputeWorkspace } from "@/components/compute-form";

export const metadata = { title: "Compute duty — StampDraft" };

export default function ComputePage() {
  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight md:text-3xl">Quick compute</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select the state and instrument, enter the facts, and get a citation-backed duty breakup.
        </p>
      </div>
      <Suspense>
        <ComputeWorkspace />
      </Suspense>
    </div>
  );
}
