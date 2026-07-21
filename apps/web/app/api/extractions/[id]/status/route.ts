import { NextRequest } from "next/server";
import { resolveWorkspace } from "@/lib/api-workspace";
import { noStore, tier2ErrorResponse, tier2Service } from "@/lib/tier2-route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const resolved = await resolveWorkspace(req);
  if (!resolved.ok) return resolved.response;
  try {
    const job = await tier2Service(resolved.workspace.store).status(resolved.workspace.firmId, params.id);
    return noStore({ ok: true, job });
  } catch (error) {
    return tier2ErrorResponse(error);
  }
}
