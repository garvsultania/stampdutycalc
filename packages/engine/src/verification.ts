import type { VersionMeta } from "@stampdraft/schema";
import { EngineError } from "./errors.js";

export interface VerificationDependency {
  label: string;
  version: VersionMeta;
}

export function isVersionVerified(version: VersionMeta): boolean {
  return version.verified_by !== null && version.verified_on !== null;
}

/** Production gate shared by rate, charging, penalty, and classification paths. */
export function assertFounderVerified(
  dependencies: readonly VerificationDependency[],
  missingDependencies: readonly string[] = [],
): void {
  const missing = [
    ...dependencies.filter((dependency) => !isVersionVerified(dependency.version)).map((dependency) => dependency.label),
    ...missingDependencies,
  ];
  if (missing.length === 0) return;
  throw new EngineError(
    `production computation requires founder-verified law; unverified dependencies: ${missing.join(", ")}`,
    "VERIFICATION_REQUIRED",
  );
}

/** Oldest review date across the entire dependency set; null if any are unverified. */
export function verifiedAsOf(dependencies: readonly VerificationDependency[]): string | null {
  if (dependencies.some((dependency) => !isVersionVerified(dependency.version))) return null;
  return dependencies.map((dependency) => dependency.version.verified_on!).sort()[0] ?? null;
}
