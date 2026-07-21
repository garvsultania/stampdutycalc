import { NextRequest, NextResponse } from "next/server";
import { internalErrorResponse, resolveWorkspace } from "@/lib/api-workspace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const resolved = await resolveWorkspace(req);
  if (!resolved.ok) return resolved.response;
  const { store, firmId } = resolved.workspace;
  try {
    return NextResponse.json({ ok: true, matters: await store.listMatters(firmId) });
  } catch {
    return internalErrorResponse("could not load matters");
  }
}

export async function POST(req: NextRequest) {
  const resolved = await resolveWorkspace(req);
  if (!resolved.ok) return resolved.response;
  const { store, firmId, principal } = resolved.workspace;
  let reference = "";
  try {
    const body = await req.json() as { reference?: unknown; title?: unknown; client?: unknown };
    reference = typeof body.reference === "string" ? body.reference.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const client = typeof body.client === "string" ? body.client.trim() : "";
    if (!reference || !title) {
      return NextResponse.json({ ok: false, error: "reference and title are required" }, { status: 400 });
    }
    const matter = await store.createMatter({
      firmId, reference, title, client: client || null,
      createdBy: principal.userEmail,
    });
    return NextResponse.json({ ok: true, matter });
  } catch (error) {
    const msg = error instanceof Error && /unique/i.test(error.message)
      ? `Matter reference "${reference}" already exists`
      : "could not create matter";
    return internalErrorResponse(msg, msg.startsWith("Matter reference") ? 409 : 400);
  }
}
