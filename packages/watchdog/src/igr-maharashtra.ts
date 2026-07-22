import { WatchdogError } from "./errors.js";
import { absolutize, attributes, stripTags } from "./html.js";

export type MaharashtraIgrPublicationFamily =
  | "acts_schedules"
  | "rules"
  | "notifications"
  | "government_resolutions"
  | "circulars"
  | "valuation_rates"
  | "fee_tables"
  | "reports";

export interface MaharashtraIgrPublicationEndpoint {
  family: MaharashtraIgrPublicationFamily;
  title: string;
  url: string;
}

const FAMILIES: ReadonlyArray<{
  family: MaharashtraIgrPublicationFamily;
  pattern: RegExp;
}> = [
  { family: "acts_schedules", pattern: /\b(?:acts?|laws?|schedules?|appendices)\b|कायदे|परिशिष्टे/iu },
  { family: "rules", pattern: /\brules?\b|नियम/iu },
  { family: "notifications", pattern: /\bnotifications?\b|अधिसूचना/iu },
  { family: "government_resolutions", pattern: /\bgovernment resolutions?\b|शासन निर्णय/iu },
  { family: "circulars", pattern: /\bcirculars?\b|परिपत्रके?/iu },
  { family: "valuation_rates", pattern: /\b(?:valuation rates?|annual statement of rates|ready reckoner|asr)\b|मूल्यांकन दर/iu },
  { family: "fee_tables", pattern: /\bfee (?:table|schedule)s?\b|शुल्क तक्ता/iu },
  { family: "reports", pattern: /\breports?\b|अहवाल/iu },
];

/** Discover first-party publication-family entry points. This is navigation
 * discovery only: a returned link proves neither document acquisition nor a
 * complete historical listing. */
export function discoverMaharashtraIgrPublicationEndpoints(
  html: string,
  responseUrl: string,
): MaharashtraIgrPublicationEndpoint[] {
  const endpoints = new Map<string, MaharashtraIgrPublicationEndpoint>();
  for (const link of html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/giu)) {
    const href = attributes(link[1]!).href;
    if (!href || /^(?:#|javascript:|mailto:|tel:)/iu.test(href)) continue;
    const title = stripTags(link[2]!) || stripTags(attributes(link[1]!).title ?? "");
    const searchable = `${title} ${href.replaceAll(/[-_/]+/gu, " ")}`;
    const definition = FAMILIES.find((candidate) => candidate.pattern.test(searchable));
    if (!definition) continue;
    const url = absolutize(responseUrl, href.replace(/\\/gu, "/"));
    endpoints.set(`${definition.family}\u0000${url}`, {
      family: definition.family,
      title: title || definition.family.replaceAll("_", " "),
      url,
    });
  }
  if (endpoints.size === 0) {
    throw new WatchdogError("IGR Maharashtra publications page exposed no recognized source-family links", "shape_drift");
  }
  return [...endpoints.values()].sort((left, right) =>
    left.family.localeCompare(right.family) || left.url.localeCompare(right.url)
  );
}
