import { z } from "zod";
import { JurisdictionSchema, MoneySchema } from "./primitives.js";
import { CitationSchema, VersionMetaSchema } from "./provenance.js";
import { PendingVerificationSchema } from "./pending.js";

/**
 * ChargingRules — the Act-level general charging rules, jurisdiction-parameterized
 * (PRD §5.4). These sit ABOVE the Schedule: they decide how many instruments bear
 * duty (s.4), whether duties aggregate (s.5), and which of two competing
 * descriptions applies (s.6). They change answers materially in real transactions
 * and are near-universally mishandled by naive calculators.
 *
 * Each section carries its own citation because each is separately load-bearing —
 * the s.4 nominal duty in particular varies wildly by state (Delhi ₹1 on the
 * un-amended central text, Karnataka ₹100, Maharashtra ₹500).
 */
export const ChargingRulesSchema = z
  .object({
    rules_id: z.string().min(1),
    jurisdiction: JurisdictionSchema,

    /** s.4 — several instruments completing ONE transaction. */
    s4: z
      .object({
        /** Duty borne by each NON-principal instrument, in place of its own Schedule duty. */
        nominal_duty: MoneySchema,
        /** The transaction types s.4 applies to — NOT uniform: Maharashtra adds
         * development agreements and leases; Delhi/Karnataka cover sale, mortgage,
         * settlement only. An instrument set outside this list does not get s.4
         * relief at all, so this list is load-bearing. */
        transaction_types: z.array(z.string().min(1)).min(1),
        source: CitationSchema,
        /** Section-scoped because doubt about the s.4 nominal amount must not
         * automatically disable the independently sourced s.5/s.6 rules. */
        pending_verification: z.array(PendingVerificationSchema).default([]),
      })
      .strict(),

    /** s.5 — one instrument, several distinct matters: duties aggregate. */
    s5: z
      .object({
        source: CitationSchema,
        pending_verification: z.array(PendingVerificationSchema).default([]),
      })
      .strict(),

    /** s.6 — one instrument within two+ descriptions: the highest duty applies. */
    s6: z
      .object({
        source: CitationSchema,
        pending_verification: z.array(PendingVerificationSchema).default([]),
      })
      .strict(),

    version: VersionMetaSchema,
    notes_for_reviewer: z.string().default(""),
  })
  .strict();
export type ChargingRules = z.infer<typeof ChargingRulesSchema>;
