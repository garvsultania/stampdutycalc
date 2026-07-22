import "server-only";
import { timingSafeEqual } from "node:crypto";

export function operationsAuthConfigured(): boolean {
  return (process.env.STAMPDRAFT_OPERATIONS_SECRET?.length ?? 0) >= 32;
}

export function authorizeOperationsHeader(header: string | null): "authorized" | "unauthorized" | "unconfigured" {
  const secret = process.env.STAMPDRAFT_OPERATIONS_SECRET;
  if (!secret || secret.length < 32) return "unconfigured";
  if (!header?.startsWith("Bearer ")) return "unauthorized";
  const supplied = Buffer.from(header.slice(7), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
    ? "authorized"
    : "unauthorized";
}
