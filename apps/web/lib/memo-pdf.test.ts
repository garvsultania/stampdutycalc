import { describe, expect, it } from "vitest";
import type { ComputeOutput } from "@stampdraft/schema";
import { renderComputationMemoPdf } from "./memo-pdf.js";

describe("computation memo PDF", () => {
  it("emits a complete searchable PDF with audit, amount, citation, and ruleset identity", () => {
    const bytes = renderComputationMemoPdf(record(output()));
    const pdf = Buffer.from(bytes).toString("latin1");

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("STAMP DUTY COMPUTATION MEMORANDUM");
    expect(pdf).toContain("INR 1,250");
    expect(pdf).toContain("Official Act s.1 \\(special\\)");
    expect(pdf).toContain("s.5 -> INR 100 <= 10x - approximately ~");
    expect(pdf).not.toContain("?");
    expect(pdf).toContain("rules-hash-123");
    expect(pdf).toMatch(/xref\n0 \d+/);
    expect(pdf.endsWith("%%EOF\n")).toBe(true);
    expectValidObjectOffsets(pdf);
  });

  it("paginates long legal-source material and numbers every page", () => {
    const long = output();
    long.citations = Array.from({ length: 35 }, (_, index) => ({
      type: "act" as const,
      ref: `Official Act section ${index + 1}`,
      quoted_text: "A sufficiently long statutory quotation ".repeat(8),
    }));
    const pdf = Buffer.from(renderComputationMemoPdf(record(long))).toString("latin1");

    const pages = (pdf.match(/\/Type \/Page(?!s)/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
    expect(pdf).toContain(`page 1 of ${pages}`);
    expect(pdf).toContain(`page ${pages} of ${pages}`);
    expectValidObjectOffsets(pdf);
  });
});

function record(value: ComputeOutput) {
  return {
    id: "d5dbdb5a-4644-47b8-9dfc-12ff54fa18dc",
    computed_at: "2026-07-21T12:00:00.000Z",
    output: value,
  };
}

function output(): ComputeOutput {
  return {
    rules_version: "rules-hash-123",
    jurisdiction: "DL",
    rule_id: "DL-CONVEYANCE",
    instrument: "conveyance_sale_deed",
    act: "Indian Stamp Act, 1899",
    article: "23",
    execution_date: "2026-07-21",
    verified_as_of: null,
    breakup: [{
      kind: "base_duty",
      label: "Base duty",
      amount: "1250",
      citations: [],
    }],
    total_duty: "1250",
    citations: [{
      type: "act",
      ref: "Official Act s.1 (special)",
      quoted_text: "§5 → ₹100 ≤ 10× — approximately ≈",
      gazette_date: "2020-01-01",
    }],
    warnings: [],
    penalty: null,
    inputs_echo: {
      jurisdiction: "DL",
      rule_id: "DL-CONVEYANCE",
      execution_date: "2026-07-21",
      values: { consideration: "25000" },
      facts: { transferee_category: "male" },
    },
  };
}

function expectValidObjectOffsets(pdf: string): void {
  const xref = pdf.slice(pdf.indexOf("xref\n"));
  const entries = xref.split("\n").slice(2).filter((line) => /^\d{10} 00000 n /.test(line));
  entries.forEach((entry, index) => {
    const offset = Number(entry.slice(0, 10));
    expect(pdf.slice(offset, offset + 12)).toMatch(new RegExp(`^${index + 1} 0 obj`));
  });
}
