import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspace } from "@/lib/api-workspace";
import { renderComputationMemoPdf } from "@/lib/memo-pdf";
import {
  resolveMemoCapabilitySecret,
  verifyMemoCapability,
} from "@/lib/memo-capability";

export const dynamic = "force-dynamic";

/** Download the immutable audit output as a real PDF. The same five-minute,
 * firm-bound capability protects both HTML rendering and this export. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return refusal("memo access refused", 403);

  const resolved = await resolveWorkspace(req);
  if (!resolved.ok) return resolved.response;
  const { store, principal } = resolved.workspace;

  let recordId: string;
  try {
    const secret = resolveMemoCapabilitySecret({
      configured: process.env.STAMPDRAFT_MEMO_CAPABILITY_SECRET,
      nodeEnv: process.env.NODE_ENV,
      hostname: req.nextUrl.hostname,
    });
    recordId = verifyMemoCapability(token, {
      secret,
      expectedFirmId: principal.firmId,
    }).recordId;
  } catch {
    return refusal("memo access refused", 403);
  }

  let record: Awaited<ReturnType<typeof store.getComputation>>;
  try {
    record = await store.getComputation(principal.firmId, recordId);
  } catch {
    return refusal("memo export unavailable", 503);
  }
  if (!record) return refusal("memo record not found", 404);

  const pdf = renderComputationMemoPdf(record);
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="stampdraft-computation-memo.pdf"',
      "Content-Length": String(pdf.byteLength),
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function refusal(error: string, status: number): NextResponse {
  const response = NextResponse.json({ ok: false, error }, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
