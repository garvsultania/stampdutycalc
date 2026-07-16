import { NextRequest, NextResponse } from "next/server";
import { DEMO_USER } from "@/lib/store-server";
import { resolveWorkspace } from "@/lib/api-workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { store, firmId } = resolved.workspace;
  return NextResponse.json({ ok: true, matters: await store.listMatters(firmId) });
}

export async function POST(req: NextRequest) {
  const { reference, title, client } = await req.json();
  if (!reference?.trim() || !title?.trim()) {
    return NextResponse.json({ ok: false, error: "reference and title are required" }, { status: 400 });
  }
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { store, firmId } = resolved.workspace;
  try {
    const matter = await store.createMatter({
      firmId, reference: reference.trim(), title: title.trim(), client: client?.trim() || null,
      createdBy: DEMO_USER.email,
    });
    return NextResponse.json({ ok: true, matter });
  } catch (e) {
    const msg = e instanceof Error && /unique/i.test(e.message)
      ? `Matter reference "${reference}" already exists`
      : "could not create matter";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
