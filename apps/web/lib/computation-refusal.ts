import type { EngineError, EngineErrorCode } from "@stampdraft/engine";

export interface ComputationRefusal {
  code: EngineErrorCode;
  title: string;
  message: string;
  nextStep: string;
  /** Whether retrying the same request later can reasonably succeed unchanged. */
  retryable: boolean;
}

type RefusalCopy = Pick<ComputationRefusal, "title" | "nextStep">;

const REFUSAL_COPY: Record<EngineErrorCode, RefusalCopy> = {
  INPUT_REQUIRED: {
    title: "Review the supplied details",
    nextStep: "Supply or correct the requested detail, then run the computation again.",
  },
  LEGAL_REVIEW_REQUIRED: {
    title: "Legal review required",
    nextStep:
      "Keep this computation unissued. Complete the identified source review or obtain adjudication before relying on a figure.",
  },
  VERIFICATION_REQUIRED: {
    title: "Founder verification required",
    nextStep:
      "Have every listed legal dependency checked and recorded by the designated founder reviewer before production use.",
  },
  EVIDENCE_REQUIRED: {
    title: "Primary-source evidence incomplete",
    nextStep:
      "Link and freshness-check primary gazette evidence for every listed dependency, then run the computation again.",
  },
  ENGINE_REFUSAL: {
    title: "Computation safely refused",
    nextStep:
      "Review the stated boundary and route this instrument for legal or encoding review. No figure was produced.",
  },
};

const ENGINE_ERROR_CODES = new Set<EngineErrorCode>(Object.keys(REFUSAL_COPY) as EngineErrorCode[]);

/** Keep route handling stable even if a bundled workspace contains two class identities. */
export function isEngineError(error: unknown): error is EngineError {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as Partial<EngineError>;
  return (
    candidate.name === "EngineError" &&
    typeof candidate.message === "string" &&
    typeof candidate.code === "string" &&
    ENGINE_ERROR_CODES.has(candidate.code as EngineErrorCode)
  );
}

/** Translate a typed engine refusal into stable API and presentation copy. */
export function describeEngineRefusal(error: Pick<EngineError, "code" | "message">): ComputationRefusal {
  const copy = REFUSAL_COPY[error.code];
  return {
    code: error.code,
    ...copy,
    message: error.message,
    retryable: false,
  };
}

export function unavailableRefusal(): ComputationRefusal {
  return {
    code: "ENGINE_REFUSAL",
    title: "Computation service unavailable",
    message: "The computation service could not be reached. No figure was produced.",
    nextStep: "Check the connection and try again. If the problem continues, contact the workspace administrator.",
    retryable: true,
  };
}
