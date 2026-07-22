export type EngineErrorCode =
  | "INPUT_REQUIRED"
  | "LEGAL_REVIEW_REQUIRED"
  | "VERIFICATION_REQUIRED"
  | "EVIDENCE_REQUIRED"
  | "ENGINE_REFUSAL";

/** Thrown for any deterministic-computation failure (unknown var, missing
 * cross-ref target, cyclic cross-ref, unresolved band, etc.). Never swallowed —
 * a silent approximation is the one unforgivable failure mode (PRD §15).
 *
 * The code is deliberately coarse: callers can present the correct safe next
 * step without parsing legal or diagnostic prose. Unclassified invariant and
 * encoding failures remain ENGINE_REFUSAL.
 */
export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(message: string, code: EngineErrorCode = "ENGINE_REFUSAL") {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}
