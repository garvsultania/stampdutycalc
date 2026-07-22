import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Process liveness only. It deliberately performs no dependency access. */
export function GET() {
  const response = NextResponse.json({ ok: true, status: "live" });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
