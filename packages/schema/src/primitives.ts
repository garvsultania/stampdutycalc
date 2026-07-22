import { z } from "zod";

/**
 * ISO calendar date, YYYY-MM-DD. Used for effective_from/to, execution dates,
 * gazette dates, verification dates. No time component — stamp law operates at
 * day granularity (execution date determines applicable law, PRD §5.4).
 */
export const ISODateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "not a valid calendar date");
export type ISODate = z.infer<typeof ISODateSchema>;

/**
 * A numeric literal carried as a string to preserve exactness across JSON
 * round-trips. The engine parses these with decimal.js — never with the JS
 * float path. Accepts plain decimals only (no exponents), non-negative or signed.
 */
export const NumericStringSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "must be a plain decimal string");
export type NumericString = z.infer<typeof NumericStringSchema>;

/**
 * A money amount. Accepted as a JS number (convenience for small integer duties
 * like ₹100) or a decimal string (preferred for anything the exactness of which
 * matters). Always non-negative — duties, premiums, considerations are never
 * negative; deficits are derived, not input. The engine converts to Decimal on
 * ingest, so no float arithmetic ever touches a money value.
 */
export const MoneySchema = z.union([
  z.number().nonnegative().finite(),
  z.string().regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal string"),
]);
export type Money = z.infer<typeof MoneySchema>;

/** MVP jurisdictions (PRD §3). DL = Delhi, MH = Maharashtra, KA = Karnataka. */
export const JurisdictionSchema = z.enum(["DL", "MH", "KA"]);
export type Jurisdiction = z.infer<typeof JurisdictionSchema>;

/**
 * Canonical MVP instrument vocabulary (PRD §3, ~15 by commercial frequency,
 * including the classification-sensitive pairs). Real (non-synthetic) rules
 * should use these keys; the ruleset validator warns on unknown instruments.
 * Kept as a plain list rather than a hard enum so synthetic M0 fixtures and
 * future additions (exchange, refund — deferred non-goals) don't require a
 * schema change.
 */
export const KNOWN_INSTRUMENTS = [
  "bond",
  "conveyance_sale_deed",
  "agreement_to_sell",
  "lease",
  "leave_and_license",
  "gift_deed",
  "general_poa",
  "special_poa",
  "mortgage_with_possession",
  "mortgage_without_possession",
  "loan_hypothecation_agreement",
  "indemnity_bond",
  "guarantee_bond",
  "partnership_deed",
  "llp_agreement",
  "memorandum_of_association",
  "affidavit",
  "works_contract",
  "service_agreement",
  "share_transfer_physical",
] as const;
export type KnownInstrument = (typeof KNOWN_INSTRUMENTS)[number];

/** Instrument key: any non-empty string; membership in KNOWN_INSTRUMENTS is advisory. */
export const InstrumentSchema = z.string().min(1);
export type Instrument = z.infer<typeof InstrumentSchema>;
