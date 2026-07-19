/**
 * StampDraft's MVP jurisdictions all use Indian civil dates. Keep this policy
 * explicit so a UTC deployment (or a browser outside India) cannot silently use
 * yesterday's date during the first 5.5 hours of an Indian day.
 */
export const LEGAL_TIME_ZONE = "Asia/Kolkata";

export function indiaTodayISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LEGAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
