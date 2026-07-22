import { NextRequest } from "next/server";
import { resolveWorkspace } from "@/lib/api-workspace";
import { findInputContract, noStore, tier2ErrorResponse, tier2Service } from "@/lib/tier2-route";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const resolved = await resolveWorkspace(req);
  if (!resolved.ok) return resolved.response;
  const { store, firmId, principal } = resolved.workspace;

  try {
    const service = tier2Service(store); // fail closed before accepting document bytes
    const form = await req.formData();
    const file = form.get("file");
    if (!isUploadedFile(file)) {
      return noStore({ ok: false, error: "a PDF or DOCX file is required", code: "invalid_request" }, 400);
    }
    const jurisdiction = text(form, "jurisdiction");
    const ruleId = text(form, "rule_id");
    const executionDate = text(form, "execution_date");
    const pageCount = Number(text(form, "page_count"));
    const retentionDays = Number(text(form, "retention_days"));
    const contract = findInputContract(jurisdiction, ruleId, executionDate);
    const job = await service.create({
      firmId,
      userEmail: principal.userEmail,
      intake: {
        filename: file.name,
        media_type: file.type,
        page_count: pageCount,
        retention_days: retentionDays,
        consent_to_process: text(form, "consent_to_process") === "true",
      },
      bytes: new Uint8Array(await file.arrayBuffer()),
      contract,
      executionDate,
      acceptedAt: new Date().toISOString(),
    });
    return noStore({ ok: true, job }, 201);
  } catch (error) {
    return tier2ErrorResponse(error);
  }
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return value !== null && typeof value !== "string" &&
    typeof value.name === "string" && typeof value.type === "string" && typeof value.arrayBuffer === "function";
}
