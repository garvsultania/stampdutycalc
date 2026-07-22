import { z } from "zod";
import { InstrumentSchema, ISODateSchema, JurisdictionSchema } from "./primitives.js";
import { VersionMetaSchema } from "./provenance.js";
import { ChargeSchema } from "./charge.js";
import { RoundingSchema } from "./rounding.js";
import { PendingVerificationSchema } from "./pending.js";
import { RuleInputContractSchema } from "./input-contract.js";

/**
 * A string reference is required throughout the rule version. An object may
 * narrow that attachment to an explicit half-open interval; outside that
 * interval the modifier is deliberately not part of the rule. This makes a
 * future concession or lapsed surcharge explicit instead of relying on a
 * missing snapshot entry being silently skipped.
 */
export const ModifierReferenceSchema = z.union([
  z.string().min(1),
  z
    .object({
      modifier_id: z.string().min(1),
      required_from: ISODateSchema.optional(),
      required_to: ISODateSchema.optional(),
    })
    .strict()
    .superRefine((ref, ctx) => {
      if (ref.required_from && ref.required_to && ref.required_to <= ref.required_from) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "required_to must be strictly after required_from",
          path: ["required_to"],
        });
      }
    }),
]);
export type ModifierReference = z.infer<typeof ModifierReferenceSchema>;

/**
 * Rule — one versioned charging rule for one instrument in one jurisdiction.
 *
 * `rule_id` is stable ACROSS versions (e.g. "DL-ART23-conveyance"); temporal
 * versions share it and are distinguished by `version.effective_from`. The tuple
 * (rule_id, effective_from) is the unique version key.
 *
 * `act` is load-bearing: Maharashtra is its own statute, not "ISA + deltas"
 * (PRD §14 Pass1.7). The schema is Act-aware per jurisdiction.
 *
 * `modifiers` are ids into the modifier set, resolved within the same version
 * snapshot at computation time.
 */
export const RuleSchema = z
  .object({
    rule_id: z.string().min(1),
    jurisdiction: JurisdictionSchema,
    act: z.string().min(1),
    article: z.string().min(1),
    instrument: InstrumentSchema,
    version: VersionMetaSchema,
    charge: ChargeSchema,
    input_contract: RuleInputContractSchema.optional(),
    modifiers: z.array(ModifierReferenceSchema).default([]),
    rounding: RoundingSchema,
    pending_verification: z.array(PendingVerificationSchema).default([]),
    notes_for_reviewer: z.string().default(""),
  })
  .strict();
export type Rule = z.infer<typeof RuleSchema>;
