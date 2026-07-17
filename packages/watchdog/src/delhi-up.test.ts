import { describe, expect, it } from "vitest";
import { parseDelhiRevenueNotifications, UP_IGRSUP_ENTRY_POINTS, upIgrsupUrl } from "./delhi-up.js";

describe("Delhi and Uttar Pradesh direct departmental sources", () => {
  it("parses Delhi Revenue PDFs and pagination from the official department", () => {
    const result = parseDelhiRevenueNotifications(`
      <a href="/sites/default/files/revenue/generic_multiple_files/scan0052.pdf">Notice under sections 31, 32 and 40 of Indian Stamp Act, 1899</a>
      <a href="?page=1">Next</a>`, "https://revenue.delhi.gov.in/revenue/notification");

    expect(result.rows[0]?.pdfRequest.url).toBe(
      "https://revenue.delhi.gov.in/sites/default/files/revenue/generic_multiple_files/scan0052.pdf",
    );
    expect(result.pages).toEqual(["https://revenue.delhi.gov.in/revenue/notification?page=1"]);
  });

  it("keeps all UP entry points on the first-party IGRSUP host", () => {
    expect(UP_IGRSUP_ENTRY_POINTS.map((entry) => entry.id)).toContain("amendments-clarifications");
    for (const entry of UP_IGRSUP_ENTRY_POINTS) {
      expect(upIgrsupUrl(entry.path)).toMatch(/^https:\/\/igrsup\.gov\.in\/igrsup\//);
    }
  });
});
