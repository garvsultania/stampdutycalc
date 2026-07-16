import { z } from "zod";
import { InstrumentSchema, JurisdictionSchema } from "./primitives.js";
import { VersionMetaSchema } from "./provenance.js";
import { ChargeSchema } from "./charge.js";
import { RoundingSchema } from "./rounding.js";
import { PendingVerificationSchema } from "./pending.js";

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
    modifiers: z.array(z.string()).default([]),
    rounding: RoundingSchema,
    pending_verification: z.array(PendingVerificationSchema).default([]),
    notes_for_reviewer: z.string().default(""),
  })
  .strict();
export type Rule = z.infer<typeof RuleSchema>;
