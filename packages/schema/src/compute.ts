import { z } from "zod";
import { ISODateSchema, JurisdictionSchema, MoneySchema, NumericStringSchema } from "./primitives.js";
import type { Citation } from "./provenance.js";

/**
 * ComputeInput — the contract into the engine. Deliberately flat and explicit:
 *  - `values` : named NUMERIC inputs the charge/formula reads (consideration,
 *               market_value, avg_annual_rent, term_years, premium,
 *               refundable_deposit, ...). Strings preferred for exactness.
 *  - `facts`  : named CATEGORICAL inputs modifier conditions read (area_type,
 *               gender, relation, buyer_type, ...).
 *  - `duty_paid` : present only in deficit/adjudication mode (Flow D).
 *
 * `execution_date` drives temporal version resolution (PRD §5.4).
 */
export const ComputeInputSchema = z
  .object({
    jurisdiction: JurisdictionSchema,
    rule_id: z.string().min(1),
    execution_date: ISODateSchema,
    values: z.record(z.union([z.number().finite(), NumericStringSchema])).default({}),
    facts: z.record(z.union([z.string(), z.number()])).default({}),
    duty_paid: MoneySchema.optional(),
  })
  .strict();
export type ComputeInput = z.infer<typeof ComputeInputSchema>;

/** A single line in the duty breakup. Amounts are exact decimal strings. */
export interface LineItem {
  kind: "base_duty" | "surcharge_cess" | "concession" | "rounding";
  label: string;
  amount: string;
  citations: Citation[];
}

/** Deficit + penalty result (Flow D). Discretionary regimes carry a range. */
export interface PenaltyResult {
  deficit: string;
  penalty_point: string | null;
  penalty_range: { min: string; max: string } | null;
  total_payable_point: string | null;
  total_payable_range: { min: string; max: string } | null;
  adjudication_path: string;
  citations: Citation[];
}

/**
 * ComputeOutput — the deterministic result. Carries the `rules_version` hash so
 * that {inputs, hash} reproduce it byte-for-byte (PRD §7). NOTE: the engine does
 * NOT stamp a wall-clock timestamp — that would break determinism; the audit
 * layer records the timestamp alongside this output.
 */
export interface ComputeOutput {
  rules_version: string;
  jurisdiction: string;
  rule_id: string;
  instrument: string;
  act: string;
  article: string;
  execution_date: string;
  verified_as_of: string | null;
  breakup: LineItem[];
  total_duty: string;
  citations: Citation[];
  escalations: string[];
  warnings: string[];
  penalty: PenaltyResult | null;
  inputs_echo: ComputeInput;
}
