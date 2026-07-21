import type { ComputeOutput } from "@stampdraft/schema";

export interface MemoPdfRecord {
  id: string;
  computed_at: string;
  output: ComputeOutput;
}

interface PdfLine {
  text: string;
  bold: boolean;
  size: number;
  leading: number;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 52;
const TOP = 790;
const BOTTOM = 52;

/** Render a standalone, text-searchable PDF from the immutable audit output.
 * The document intentionally uses only built-in PDF fonts, avoiding a runtime
 * font/package/network dependency in the protected export path. */
export function renderComputationMemoPdf(record: MemoPdfRecord): Uint8Array {
  const lines = memoLines(record);
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  let remaining = TOP - BOTTOM;
  for (const line of lines) {
    if (page.length > 0 && line.leading > remaining) {
      pages.push(page);
      page = [];
      remaining = TOP - BOTTOM;
    }
    page.push(line);
    remaining -= line.leading;
  }
  if (page.length > 0) pages.push(page);
  if (pages.length === 0) pages.push([]);
  return buildPdf(pages);
}

function memoLines(record: MemoPdfRecord): PdfLine[] {
  const output = record.output;
  const lines: PdfLine[] = [];
  const add = (text: unknown, options: Partial<Omit<PdfLine, "text">> = {}) => {
    const bold = options.bold ?? false;
    const size = options.size ?? 10;
    const leading = options.leading ?? size + 4;
    for (const wrapped of wrap(ascii(String(text)), bold || size >= 14 ? 70 : 92)) {
      lines.push({ text: wrapped, bold, size, leading });
    }
  };
  const gap = (height = 8) => lines.push({ text: "", bold: false, size: 1, leading: height });
  const heading = (text: string) => {
    gap(8);
    add(text.toUpperCase(), { bold: true, size: 11, leading: 16 });
  };
  const field = (label: string, value: unknown) => add(`${label}: ${String(value)}`);

  add("StampDraft", { bold: true, size: 18, leading: 23 });
  add("STAMP DUTY COMPUTATION MEMORANDUM", { bold: true, size: 12, leading: 18 });
  field("Audit record", record.id);
  field("Computed at", record.computed_at);
  field(
    "Verification",
    output.verified_as_of
      ? `founder-verified as of ${output.verified_as_of}`
      : "draft encoding - founder verification pending",
  );

  heading("The instrument");
  field("Instrument", labelize(output.instrument));
  field("Jurisdiction", output.jurisdiction);
  field("Charging provision", `${output.act}, Article ${output.article}`);
  field("Execution date", output.execution_date);
  field("Rule", output.rule_id);

  heading("Inputs as confirmed");
  for (const [key, value] of Object.entries(output.inputs_echo.values)) {
    field(labelize(key), money(String(value)));
  }
  for (const [key, value] of Object.entries(output.inputs_echo.facts)) {
    field(labelize(key), labelize(String(value)));
  }
  if (output.inputs_echo.duty_paid !== undefined) {
    field("Duty actually paid", money(String(output.inputs_echo.duty_paid)));
  }

  heading("Computation");
  for (const item of output.breakup) {
    add(`${labelize(item.kind)} - ${item.label}: ${money(item.amount)}`);
  }
  add(`TOTAL DUTY PAYABLE: ${money(output.total_duty)}`, { bold: true, size: 12, leading: 18 });

  if (output.penalty) {
    heading("Deficit and penalty");
    field("Deficit", money(output.penalty.deficit));
    field(
      "Penalty",
      output.penalty.penalty_point !== null
        ? money(output.penalty.penalty_point)
        : output.penalty.penalty_range
          ? `${money(output.penalty.penalty_range.min)} to ${money(output.penalty.penalty_range.max)}`
          : "not calculated",
    );
    field(
      "Total payable",
      output.penalty.total_payable_point !== null
        ? money(output.penalty.total_payable_point)
        : output.penalty.total_payable_range
          ? `${money(output.penalty.total_payable_range.min)} to ${money(output.penalty.total_payable_range.max)}`
          : "not calculated",
    );
    field("Adjudication path", output.penalty.adjudication_path);
  }

  heading("Legal sources");
  output.citations.forEach((citation, index) => {
    add(`${index + 1}. ${citation.ref}`, { bold: true });
    add(`Quoted text: ${citation.quoted_text}`);
    if (citation.gazette_date) field("Gazette date", citation.gazette_date);
  });

  if (output.warnings.length > 0) {
    heading("Warnings");
    output.warnings.forEach((warning, index) => add(`${index + 1}. ${warning}`));
  }

  heading("Reproducibility and scope");
  field("Ruleset identity", output.rules_version);
  add(
    "This memorandum is the immutable output filed under the versioned rule corpus identified above. Historical replay requires the archived snapshot and matching engine artifact.",
  );
  add(
    "It is a computation report on the law as published, not a legal opinion. Professional judgment and, where indicated, adjudication under the applicable Stamp Act remain with the practitioner.",
  );
  return lines;
}

function buildPdf(pages: PdfLine[][]): Uint8Array {
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((lines, index) => {
    const pageId = pageIds[index]!;
    const contentId = pageId + 1;
    const stream = pageStream(lines, index + 1, pages.length);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  });

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets = new Array<number>(objects.length).fill(0);
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = chunks.reduce((total, chunk) => total + chunk.length, 0);
    chunks.push(Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, "ascii"));
  }
  const xrefOffset = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const xref = [
    `xref\n0 ${objects.length}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join("");
  chunks.push(Buffer.from(xref, "ascii"));
  return new Uint8Array(Buffer.concat(chunks));
}

function pageStream(lines: PdfLine[], pageNumber: number, pageCount: number): string {
  let y = TOP;
  const commands = ["BT"];
  for (const line of lines) {
    y -= line.leading;
    if (line.text.length === 0) continue;
    commands.push(
      `/${line.bold ? "F2" : "F1"} ${line.size} Tf`,
      `1 0 0 1 ${LEFT} ${y} Tm`,
      `(${pdfEscape(line.text)}) Tj`,
    );
  }
  commands.push(
    "/F1 8 Tf",
    `1 0 0 1 ${LEFT} 30 Tm`,
    `(StampDraft computation memo - page ${pageNumber} of ${pageCount}) Tj`,
    "ET",
  );
  return commands.join("\n");
}

function wrap(value: string, width: number): string[] {
  if (value.length === 0) return [""];
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > width) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let index = 0; index < word.length; index += width) lines.push(word.slice(index, index + width));
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function money(value: string): string {
  const negative = value.startsWith("-");
  const [integer, fraction] = (negative ? value.slice(1) : value).split(".");
  const lastThree = integer.slice(-3);
  const rest = integer.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${lastThree}` : lastThree;
  return `${negative ? "-" : ""}INR ${grouped}${fraction ? `.${fraction}` : ""}`;
}

function ascii(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u00B7/g, " - ")
    .replace(/\u00D7/g, "x")
    .replace(/\u2026/g, "...")
    .replace(/\u2192/g, "->")
    .replace(/\u2248/g, "~")
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\u20B9/g, "INR ")
    .replace(/\u00A7/g, "s.")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
