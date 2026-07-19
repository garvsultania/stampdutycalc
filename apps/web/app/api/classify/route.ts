import { NextRequest, NextResponse } from "next/server";
import { classify, resolveClassificationTree } from "@stampdraft/engine";
import { getCorpus } from "@/lib/rules-server";
import { indiaTodayISO } from "@/lib/legal-date";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { tree_id, answers, execution_date } = await req.json();
    const { corpus } = getCorpus();
    if (!corpus.trees.some((tree) => tree.tree_id === tree_id)) {
      return NextResponse.json({ ok: false, error: "unknown tree" }, { status: 404 });
    }
    const tree = resolveClassificationTree(corpus.trees, tree_id, execution_date);
    const result = classify(tree, answers ?? {}, {
      executionDate: execution_date,
      requireVerified: process.env.NODE_ENV === "production",
      requireEvidence: process.env.NODE_ENV === "production",
      evidenceAsOf: indiaTodayISO(),
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "classification failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
