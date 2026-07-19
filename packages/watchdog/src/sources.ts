import { WatchdogError } from "./errors.js";
import type { SourceId } from "./types.js";

export type Jurisdiction = "DL" | "GJ" | "KA" | "MH" | "TG" | "TN" | "UP";
export type AdapterKind = "aspnet_postback" | "search_form" | "static_index";
export type SourceStatus = "accepted" | "provisional";
export type PublicationKind = "acts" | "department_orders" | "gazette" | "notifications";

export interface SourceDefinition {
  id: SourceId;
  /** Historical source IDs retained by immutable index/sweep records. */
  evidence_ids?: string[];
  jurisdiction: Jurisdiction;
  name: string;
  owner: string;
  baseUrl: string;
  probeUrl?: string;
  allowedHosts: string[];
  adapter: AdapterKind;
  publication: PublicationKind;
  status: SourceStatus;
  authority: "official_government";
  languages: string[];
  ocr: "never" | "recorded_fallback";
  description: string;
  acceptance?: string[];
}

const SOURCES: readonly SourceDefinition[] = [
  {
    id: "mh-egazette-part8",
    evidence_ids: ["mh-egazette"],
    jurisdiction: "MH",
    name: "Maharashtra e-Gazette Part 8 English Extra-Ordinary",
    owner: "Directorate of Government Printing, Stationery and Publications, Government of Maharashtra",
    baseUrl: "https://egazzete.mahaonline.gov.in/Forms/GazetteSearch.aspx",
    allowedHosts: ["egazzete.mahaonline.gov.in"],
    adapter: "aspnet_postback",
    publication: "gazette",
    status: "accepted",
    authority: "official_government",
    languages: ["en"],
    ocr: "never",
    description: "Official Maharashtra Acts and bills published in Part 8 English Extra-Ordinary.",
    acceptance: ["Maharashtra Acts LXIII/2025, XIII/2026, XVI/2026, and XXIX/2026"],
  },
  {
    id: "mh-egazette-part4b",
    jurisdiction: "MH",
    name: "Maharashtra e-Gazette Part IV-B",
    owner: "Directorate of Government Printing, Stationery and Publications, Government of Maharashtra",
    baseUrl: "https://egazzete.mahaonline.gov.in/Forms/GazetteSearch.aspx",
    allowedHosts: ["egazzete.mahaonline.gov.in"],
    adapter: "aspnet_postback",
    publication: "gazette",
    status: "accepted",
    authority: "official_government",
    languages: ["en", "mr"],
    ocr: "recorded_fallback",
    description: "Official Maharashtra notifications published in Part IV-B; the accepted archive covers 2021-07-17 through 2026-07-19, while earlier history remains outside the proven interval.",
    acceptance: [
      "2,575 rows across 26 pages for 2021-07-17 through 2026-07-19",
      "2,575-document independent content re-fetch with zero new blobs",
      "2,575 stable row identities reused with zero additions",
      "2026-01-09 Mudrank-2024/C.R.182/Mudrank-2 notification",
    ],
  },
  {
    id: "gj-egazette",
    jurisdiction: "GJ",
    name: "Gujarat e-Gazette",
    owner: "Directorate of Government Printing and Stationery, Government of Gujarat",
    baseUrl: "https://egazette.gujarat.gov.in/GazettesSearch.aspx",
    probeUrl: "https://egazette.gujarat.gov.in/RecentGazette.aspx",
    allowedHosts: ["egazette.gujarat.gov.in"],
    adapter: "aspnet_postback",
    publication: "gazette",
    status: "provisional",
    authority: "official_government",
    languages: ["en", "gu"],
    ocr: "recorded_fallback",
    description: "Official ordinary and extraordinary Gujarat gazettes from the state printing directorate.",
  },
  {
    id: "ka-dpal-acts",
    jurisdiction: "KA",
    name: "Karnataka DPAL Acts and Ordinances",
    owner: "Department of Parliamentary Affairs and Legislation, Government of Karnataka",
    baseUrl: "https://dpal.karnataka.gov.in/23/acts-and-ordinances/kn",
    probeUrl: "https://dpal.karnataka.gov.in/79/2025/en",
    allowedHosts: ["dpal.karnataka.gov.in"],
    adapter: "static_index",
    publication: "acts",
    status: "provisional",
    authority: "official_government",
    languages: ["en", "kn"],
    ocr: "recorded_fallback",
    description: "Official annual Acts and Ordinances published by Karnataka DPAL.",
    acceptance: ["Acts 26/2021, 11/2022, 12/2022, 31/2022, 03/2023, 04/2024, 23/2024, 30/2025, and 42/2025"],
  },
  {
    id: "tn-gazette-ordinary",
    jurisdiction: "TN",
    name: "Tamil Nadu Gazette",
    owner: "Stationery and Printing Department, Government of Tamil Nadu",
    baseUrl: "https://stationeryprinting.tn.gov.in/gazette.php",
    allowedHosts: ["stationeryprinting.tn.gov.in", "www.stationeryprinting.tn.gov.in"],
    adapter: "static_index",
    publication: "gazette",
    status: "provisional",
    authority: "official_government",
    languages: ["en", "ta"],
    ocr: "recorded_fallback",
    description: "Official regular Tamil Nadu gazette year, issue, and direct PDF hierarchy.",
  },
  {
    id: "tn-gazette-extraordinary",
    jurisdiction: "TN",
    name: "Tamil Nadu Extraordinary Gazette",
    owner: "Stationery and Printing Department, Government of Tamil Nadu",
    baseUrl: "https://stationeryprinting.tn.gov.in/extra_ordinary_lists.php",
    probeUrl: "https://stationeryprinting.tn.gov.in/extra_ordinary_lists.php?id=MjAyNg==",
    allowedHosts: ["stationeryprinting.tn.gov.in", "www.stationeryprinting.tn.gov.in"],
    adapter: "static_index",
    publication: "gazette",
    status: "provisional",
    authority: "official_government",
    languages: ["en", "ta"],
    ocr: "recorded_fallback",
    description: "Official extraordinary Tamil Nadu gazette archive.",
  },
  {
    id: "up-igrsup-orders",
    jurisdiction: "UP",
    name: "Uttar Pradesh Stamp and Registration Orders",
    owner: "Stamp and Registration Department, Government of Uttar Pradesh",
    baseUrl: "https://igrsup.gov.in/igrsup/defaultAction.action",
    allowedHosts: ["igrsup.gov.in"],
    adapter: "static_index",
    publication: "department_orders",
    status: "provisional",
    authority: "official_government",
    languages: ["en", "hi"],
    ocr: "recorded_fallback",
    description: "Official Acts, Rules, fee tables, valuation orders, and amendment or clarification pages.",
  },
  {
    id: "dl-revenue-notifications",
    jurisdiction: "DL",
    name: "Delhi Revenue Notifications",
    owner: "Department of Revenue, Government of NCT of Delhi",
    baseUrl: "https://revenue.delhi.gov.in/revenue/notification",
    allowedHosts: ["revenue.delhi.gov.in"],
    adapter: "static_index",
    publication: "notifications",
    status: "provisional",
    authority: "official_government",
    languages: ["en", "hi"],
    ocr: "recorded_fallback",
    description: "Official Delhi Revenue notification categories and linked primary documents.",
  },
  {
    id: "tg-goir-revenue",
    jurisdiction: "TG",
    name: "Telangana Government Orders — Revenue",
    owner: "Information Technology, Electronics and Communications Department, Government of Telangana",
    baseUrl: "https://goir.telangana.gov.in/",
    allowedHosts: ["goir.telangana.gov.in"],
    adapter: "search_form",
    publication: "department_orders",
    status: "provisional",
    authority: "official_government",
    languages: ["en", "te", "ur"],
    ocr: "recorded_fallback",
    description: "Official Government Orders filtered to Revenue; this source does not claim complete gazette coverage.",
  },
];

const BY_ID = new Map<SourceId, SourceDefinition>(SOURCES.map((source) => [source.id, source]));

export function listSources(): readonly SourceDefinition[] {
  return SOURCES;
}

export function sourceById(id: SourceId): SourceDefinition {
  const source = BY_ID.get(id);
  if (!source) throw new WatchdogError(`Unknown watchdog source ${id}`, "shape_drift");
  return source;
}

export function validateSourceDefinition(source: SourceDefinition): void {
  if (!/^[a-z]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id)) {
    throw new WatchdogError(`Invalid watchdog source id ${source.id}`, "shape_drift");
  }
  for (const evidenceId of source.evidence_ids ?? []) {
    if (!/^[a-z]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(evidenceId)) {
      throw new WatchdogError(`Invalid legacy evidence source id ${evidenceId}`, "shape_drift");
    }
  }
  const url = new URL(source.baseUrl);
  if (url.protocol !== "https:") throw new WatchdogError(`Watchdog source must use HTTPS: ${source.id}`, "shape_drift");
  if (source.authority !== "official_government") {
    throw new WatchdogError(`Watchdog source is not first-party government evidence: ${source.id}`, "shape_drift");
  }
  if (source.languages.length === 0) throw new WatchdogError(`Watchdog source has no languages: ${source.id}`, "shape_drift");
  if (!source.allowedHosts.includes(url.hostname)) {
    throw new WatchdogError(`Watchdog source base host is not allowlisted: ${source.id}`, "shape_drift");
  }
  if (source.probeUrl) {
    const probeUrl = new URL(source.probeUrl);
    if (probeUrl.protocol !== "https:" || !source.allowedHosts.includes(probeUrl.hostname)) {
      throw new WatchdogError(`Watchdog probe URL is outside the source allowlist: ${source.id}`, "shape_drift");
    }
  }
  if (source.allowedHosts.some((host) => !/\.(gov\.in|nic\.in)$/.test(host))) {
    throw new WatchdogError(`Watchdog source host is not a government domain: ${source.id}`, "shape_drift");
  }
}

export function assertOfficialUrl(source: SourceDefinition, value: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:" || !source.allowedHosts.includes(url.hostname)) {
    throw new WatchdogError(`Document URL is outside the official source allowlist for ${source.id}: ${value}`, "shape_drift");
  }
}

for (const source of SOURCES) validateSourceDefinition(source);

const EVIDENCE_IDS = new Map<string, string>();
for (const source of SOURCES) {
  for (const evidenceId of [source.id, ...(source.evidence_ids ?? [])]) {
    const existing = EVIDENCE_IDS.get(evidenceId);
    if (existing) {
      throw new WatchdogError(
        `Evidence source id ${evidenceId} is claimed by both ${existing} and ${source.id}`,
        "shape_drift",
      );
    }
    EVIDENCE_IDS.set(evidenceId, source.id);
  }
}
