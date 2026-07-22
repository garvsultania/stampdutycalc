import { NextRequest } from "next/server";
import { authorizeOperationsHeader } from "@/lib/operations-auth";
import { getStore } from "@/lib/store-server";
import { noStore, tier2ErrorResponse, tier2Service } from "@/lib/tier2-route";

export const dynamic = "force-dynamic";

/** Deployment schedulers call this bounded hook; provider deletion remains
 * idempotent and every document/source-snippet pair is deleted together. */
export async function POST(request: NextRequest) {
  const authorization = authorizeOperationsHeader(request.headers.get("authorization"));
  if (authorization === "unconfigured") {
    return noStore({ ok: false, error: "retention operation is not configured" }, 503);
  }
  if (authorization !== "authorized") {
    return noStore({ ok: false, error: "authentication required" }, 401);
  }

  try {
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? "100");
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 500
      ? requestedLimit
      : 100;
    const result = await tier2Service(await getStore()).expireDue(new Date().toISOString(), limit);
    return noStore({ ok: true, ...result });
  } catch (error) {
    return tier2ErrorResponse(error);
  }
}
