import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  discoverDelhiRevenueNotifications,
  discoverKarnatakaRequiredActs,
  KARNATAKA_REQUIRED_ACTS,
} from "./discovery.js";
import { parseGujaratRecentGazettes } from "./gujarat.js";
import { htmlText } from "./html.js";
import { discoverMaharashtraIgrPublicationEndpoints } from "./igr-maharashtra.js";
import { inspectTelanganaGoirForm } from "./telangana.js";
import { parseTamilNaduGazettePdfs, parseTamilNaduOrdinaryIssues } from "./tamil-nadu.js";
import type { Fetcher, SourceId } from "./types.js";
import { assertOfficialUrl, sourceById } from "./sources.js";

export interface ProbeReport {
  sourceId: SourceId;
  status: "probe_ok";
  documents: number;
  pages?: number;
  detail: string;
}

export async function probeSource(fetcher: Fetcher, sourceId: SourceId, outputPath?: string): Promise<ProbeReport> {
  const source = sourceById(sourceId);
  let report: ProbeReport;

  if (sourceId === "ka-dpal-acts") {
    const discovery = await discoverKarnatakaRequiredActs(fetcher);
    const documents = discovery.groups.reduce((sum, group) => sum + group.rows.length, 0);
    report = {
      sourceId,
      status: "probe_ok",
      documents,
      pages: discovery.listingPages,
      detail: `${discovery.groups.length} identifiable Acts across ${discovery.listingPages} annual pages; all ${KARNATAKA_REQUIRED_ACTS.length} required amendment Acts identified; PDFs not acquired by probe`,
    };
  } else if (sourceId === "dl-revenue-notifications") {
    const discovery = await discoverDelhiRevenueNotifications(fetcher);
    report = {
      sourceId,
      status: "probe_ok",
      documents: discovery.rows.length,
      pages: discovery.listingPages,
      detail: `${discovery.rows.length} PDF links across ${discovery.listingPages} traversed listing pages; PDFs not acquired by probe`,
    };
  } else {
    const probeUrl = source.probeUrl ?? source.baseUrl;
    assertOfficialUrl(source, probeUrl);
    const response = await fetcher.request({ url: probeUrl });
    assertOfficialUrl(source, response.url);
    const html = htmlText(response.body);

    if (sourceId === "gj-egazette") {
      const page = parseGujaratRecentGazettes(html, response.url);
      for (const row of [...page.ordinary, ...page.extraordinary]) assertOfficialUrl(source, row.pdfRequest.url);
      report = {
        sourceId,
        status: "probe_ok",
        documents: page.ordinary.length + page.extraordinary.length,
        pages: page.page.pagesExpected,
        detail: `${page.ordinary.length} ordinary and ${page.extraordinary.length} extraordinary rows on the recent page`,
      };
    } else if (sourceId === "tn-gazette-ordinary") {
      const pages = parseTamilNaduOrdinaryIssues(html, response.url);
      for (const url of pages) assertOfficialUrl(source, url);
      report = { sourceId, status: "probe_ok", documents: 0, pages: pages.length, detail: `${pages.length} issue-detail pages` };
    } else if (sourceId === "tn-gazette-extraordinary") {
      const rows = parseTamilNaduGazettePdfs(html, response.url);
      for (const row of rows) assertOfficialUrl(source, row.pdfRequest.url);
      report = { sourceId, status: "probe_ok", documents: rows.length, detail: `${rows.length} extraordinary PDF rows` };
    } else if (sourceId === "mh-igr-publications") {
      const endpoints = discoverMaharashtraIgrPublicationEndpoints(html, response.url);
      for (const endpoint of endpoints) assertOfficialUrl(source, endpoint.url);
      report = {
        sourceId,
        status: "probe_ok",
        documents: 0,
        pages: endpoints.length,
        detail: `${endpoints.length} publication entry points across ${new Set(endpoints.map((endpoint) => endpoint.family)).size} families; documents not acquired by probe`,
      };
    } else if (sourceId === "tg-goir-revenue") {
      const form = inspectTelanganaGoirForm(html);
      report = { sourceId, status: "probe_ok", documents: 0, detail: `Revenue option ${form.department.value}; results not acquired by probe` };
    } else {
      report = { sourceId, status: "probe_ok", documents: 0, detail: "Official source reached; source-specific discovery is not yet implemented" };
    }
  }

  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report)}\n`, "utf8");
  }
  return report;
}
