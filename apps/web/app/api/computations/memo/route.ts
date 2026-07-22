import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspace } from "@/lib/api-workspace";
import {
  issueMemoCapabilityForRecord,
  resolveMemoCapabilitySecret,
} from "@/lib/memo-capability";

export const dynamic = "force-dynamic";

/** Authorize the record lookup, mint a short-lived capability, and leave no permanent ID URL. */
export async function GET(req: NextRequest) {
  const recordId = req.nextUrl.searchParams.get("recordId");
  if (!recordId) return noStoreJson({ ok: false, error: "record not found" }, 404);

  const resolved = await resolveWorkspace(req);
  if (!resolved.ok) return resolved.response;
  const { store, principal } = resolved.workspace;

  let secret: string;
  try {
    secret = resolveMemoCapabilitySecret({
      configured: process.env.STAMPDRAFT_MEMO_CAPABILITY_SECRET,
      nodeEnv: process.env.NODE_ENV,
      hostname: req.nextUrl.hostname,
    });
  } catch {
    return noStoreJson({ ok: false, error: "memo access unavailable" }, 503);
  }

  let token: string | null;
  try {
    token = await issueMemoCapabilityForRecord(store, {
      secret,
      recordId,
      firmId: principal.firmId,
    });
  } catch {
    return noStoreJson({ ok: false, error: "memo access unavailable" }, 503);
  }
  if (!token) return noStoreJson({ ok: false, error: "record not found" }, 404);

  const destination = new URL("/memo", req.url);
  destination.searchParams.set("token", token);
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function noStoreJson(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
