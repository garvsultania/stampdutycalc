import { NextResponse } from "next/server";
import {
  isProductionDatabaseBackupProviderConfigured,
  productionDatabaseBackupReady,
} from "@stampdraft/store";
import { getStore } from "@/lib/store-server";
import {
  isRequestPrincipalAdapterConfigured,
  requestPrincipalAdapterReady,
} from "@/lib/request-principal";
import {
  isProductionTier2ProviderConfigured,
  productionTier2ProviderReady,
} from "@/lib/tier2-provider";
import { operationsAuthConfigured } from "@/lib/operations-auth";

export const dynamic = "force-dynamic";

type Check = "ready" | "unavailable" | "unconfigured" | "invalid";

export async function GET() {
  const checks: {
    database: Check;
    schema: Check;
    append_only: Check;
    archive_integrity: Check;
    authentication: Check;
    extraction: Check;
    retention_operations: Check;
    backup: Check;
  } = {
    database: "unavailable",
    schema: "unavailable",
    append_only: "unavailable",
    archive_integrity: "unavailable",
    authentication: isRequestPrincipalAdapterConfigured() ? "unavailable" : "unconfigured",
    extraction: isProductionTier2ProviderConfigured() ? "unavailable" : "unconfigured",
    retention_operations: operationsAuthConfigured() ? "ready" : "unconfigured",
    backup: isProductionDatabaseBackupProviderConfigured() ? "unavailable" : "unconfigured",
  };

  const [authenticationReady, extractionReady, backupReady] = await Promise.all([
    requestPrincipalAdapterReady(),
    productionTier2ProviderReady(),
    productionDatabaseBackupReady(),
  ]);
  if (authenticationReady) checks.authentication = "ready";
  if (extractionReady) checks.extraction = "ready";
  if (backupReady) checks.backup = "ready";

  try {
    const health = await (await getStore()).checkReadiness();
    checks.database = "ready";
    checks.schema = health.tablesReady && health.constraintsReady &&
      health.schemaVersion === health.latestSchemaVersion ? "ready" : "invalid";
    checks.append_only = health.appendOnlyReady ? "ready" : "invalid";
    checks.archive_integrity = health.archiveIntegrityReady ? "ready" : "invalid";
  } catch {
    // Dependency errors are intentionally collapsed to the stable state above.
  }

  const ready = Object.values(checks).every((check) => check === "ready");
  const response = NextResponse.json(
    { ok: ready, status: ready ? "ready" : "not_ready", checks },
    { status: ready ? 200 : 503 },
  );
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
