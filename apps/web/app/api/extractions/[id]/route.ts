import { NextRequest } from "next/server";
import { resolveWorkspace } from "@/lib/api-workspace";
import { contractForJob, noStore, tier2ErrorResponse, tier2Service } from "@/lib/tier2-route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const resolved = await resolveWorkspace(req);
  if (!resolved.ok) return resolved.response;
  const { store, firmId } = resolved.workspace;
  try {
    const contract = await contractForJob(store, firmId, params.id);
    const draft = await tier2Service(store).readDraft(firmId, params.id, contract);
    return noStore({ ok: true, draft });
  } catch (error) {
    return tier2ErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const resolved = await resolveWorkspace(req);
  if (!resolved.ok) return resolved.response;
  const { store, firmId } = resolved.workspace;
  try {
    const job = await tier2Service(store).delete(firmId, params.id, new Date().toISOString(), "user_deleted");
    return noStore({ ok: true, job });
  } catch (error) {
    return tier2ErrorResponse(error);
  }
}
