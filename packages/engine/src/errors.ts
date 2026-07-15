/** Thrown for any deterministic-computation failure (unknown var, missing
 * cross-ref target, cyclic cross-ref, unresolved band, etc.). Never swallowed —
 * a silent approximation is the one unforgivable failure mode (PRD §15). */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}
