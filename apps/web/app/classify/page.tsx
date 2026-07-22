import { getCorpus } from "@/lib/rules-server";
import { ClassifyWizard, type TreeMeta } from "@/components/classify-wizard";

export const metadata = { title: "Classify an instrument — StampDraft" };

const TITLES: Record<string, { title: string; description: string }> = {
  lease_vs_leave_and_license: {
    title: "Lease vs Leave & License",
    description: "Exclusive possession, intention to create an interest, substance over label.",
  },
  works_vs_service: {
    title: "Works contract vs Service agreement",
    description: "Transfer of property in goods, predominant nature — in Maharashtra this fork is worth up to ~495× the duty.",
  },
};

export default function ClassifyPage() {
  const { corpus } = getCorpus();
  const trees: TreeMeta[] = corpus.trees.map((t) => ({
    tree_id: t.tree_id,
    jurisdiction: t.jurisdiction,
    instrument_class: t.instrument_class,
    title: TITLES[t.instrument_class]?.title ?? t.instrument_class,
    description: TITLES[t.instrument_class]?.description ?? "",
  }));

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight md:text-3xl">Classification questionnaire</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The statutory and judicial tests, one question at a time. Terminal answers map to a Schedule entry;
          genuine grey zones escalate instead of guessing.
        </p>
      </div>
      <ClassifyWizard trees={trees} />
    </div>
  );
}
