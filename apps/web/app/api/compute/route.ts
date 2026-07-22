import { NextRequest, NextResponse } from "next/server";
import { compute } from "@stampdraft/engine";
import { getCorpus } from "@/lib/rules-server";
import { executionPolicyForRequest } from "@/lib/execution-policy";
import { describeEngineRefusal, isEngineError } from "@/lib/computation-refusal";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { corpus } = getCorpus();
    const output = compute(corpus.ruleSet, body.input, {
      penaltyMonths: body.penaltyMonths === undefined ? undefined : Number(body.penaltyMonths),
      ...executionPolicyForRequest(req),
    });
    return NextResponse.json({ ok: true, output });
  } catch (e) {
    if (isEngineError(e)) {
      // Escalation-by-error is a product feature, not a failure (PRD §15).
      return NextResponse.json(
        { ok: false, refusal: describeEngineRefusal(e), escalation: e.message },
        { status: 422 },
      );
    }
    const message = e instanceof Error ? e.message : "computation failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
