import { NextRequest, NextResponse } from "next/server";
import { compute, EngineError } from "@stampdraft/engine";
import { getCorpus } from "@/lib/rules-server";
import { indiaTodayISO } from "@/lib/legal-date";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { corpus } = getCorpus();
    const output = compute(corpus.ruleSet, body.input, {
      penaltyMonths: body.penaltyMonths === undefined ? undefined : Number(body.penaltyMonths),
      requireVerified: process.env.NODE_ENV === "production",
      requireEvidence: process.env.NODE_ENV === "production",
      evidenceAsOf: indiaTodayISO(),
    });
    return NextResponse.json({ ok: true, output });
  } catch (e) {
    if (e instanceof EngineError) {
      // Escalation-by-error is a product feature, not a failure (PRD §15).
      return NextResponse.json({ ok: false, escalation: e.message }, { status: 422 });
    }
    const message = e instanceof Error ? e.message : "computation failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
