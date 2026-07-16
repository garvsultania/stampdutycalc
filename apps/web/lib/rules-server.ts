import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadStateDir, mergeLoads, type LoadResult } from "@stampdraft/engine";

/** Walk up from cwd until the repo's rules/ directory is found. */
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, "rules", "DL"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("StampDraft rules directory not found — run from within the repo");
}

export const STATES = [
  { code: "DL", name: "Delhi", act: "Indian Stamp Act, 1899 (Sch. I-A)" },
  { code: "MH", name: "Maharashtra", act: "Maharashtra Stamp Act, 1958" },
  { code: "KA", name: "Karnataka", act: "Karnataka Stamp Act, 1957" },
] as const;
export type StateCode = (typeof STATES)[number]["code"];

let cache: { corpus: LoadResult; perState: Record<StateCode, LoadResult> } | null = null;

/** Load and cache the full rules-as-data corpus (rules, modifiers, penalties, trees). */
export function getCorpus() {
  if (cache) return cache;
  const root = repoRoot();
  const perState = Object.fromEntries(
    STATES.map((s) => [s.code, loadStateDir(path.join(root, "rules", s.code))])
  ) as Record<StateCode, LoadResult>;
  const corpus = mergeLoads(Object.values(perState));
  const parseErrors = corpus.parseErrors;
  if (parseErrors.length > 0) {
    // Fail loudly — a malformed rule file must never silently vanish from the corpus.
    throw new Error(`rule corpus has parse errors: ${parseErrors.map((e) => e.file).join(", ")}`);
  }
  cache = { corpus, perState };
  return cache;
}
