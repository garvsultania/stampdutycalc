import { NextRequest, NextResponse } from "next/server";
import { classify } from "@stampdraft/engine";
import { getCorpus } from "@/lib/rules-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { tree_id, answers } = await req.json();
    const { corpus } = getCorpus();
    const tree = corpus.trees.find((t) => t.tree_id === tree_id);
    if (!tree) return NextResponse.json({ ok: false, error: "unknown tree" }, { status: 404 });
    const result = classify(tree, answers ?? {});
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "classification failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
