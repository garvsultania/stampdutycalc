import { z } from "zod";
import { ConditionSchema, type Condition } from "./condition.js";

/**
 * PendingVerification — an encoded, machine-readable statement that some part of
 * a rule is NOT trustworthy yet.
 *
 * This exists because `notes_for_reviewer` is prose: a human reads it in a PR and
 * the engine cannot. Before this, a cell the encoder had explicitly marked as
 * untrusted still produced a number that looked exactly as authoritative as a
 * verified one. That is the project's one unforgivable failure mode — a silent
 * approximation — so an untrusted cell must be able to stop the computation.
 *
 * `when` scopes the flag to the cell that is actually doubtful, not the whole
 * rule. Delhi's transfer duty is verified for male and female purchasers; only
 * the JOINT split above ₹25L is unsourced. Flagging the whole modifier would
 * refuse every Delhi conveyance, so the flag carries the same Condition language
 * the rules already use and fires only on the doubtful combination.
 *
 * `severity` defaults to "refuse" deliberately. A warning is something a hurried
 * lawyer clicks past; refusing is the only response that cannot be ignored.
 * "warn" is an explicit opt-down for cases where the DUTY is sound and the doubt
 * is about something else — e.g. Delhi share transfer, where the amount is
 * confident and only WHO pays is contested. Emitting a correct number with a
 * caveat is right there; refusing would be false precision about our own doubt.
 */
export type PendingVerification = {
  /** What is unverified and what a verifier must do. Written for the founder. */
  reason: string;
  /** Scope. Omitted = the whole rule/modifier is untrusted. */
  when?: Condition;
  /** "refuse" (default) stops the computation; "warn" annotates it. */
  severity?: "refuse" | "warn";
};

export const PendingVerificationSchema: z.ZodType<PendingVerification> = z
  .object({
    reason: z.string().min(1),
    when: ConditionSchema.optional(),
    severity: z.enum(["refuse", "warn"]).optional(),
  })
  .strict();

/** Refuse unless the encoder explicitly opted down to a warning. */
export function pendingSeverity(p: PendingVerification): "refuse" | "warn" {
  return p.severity ?? "refuse";
}
