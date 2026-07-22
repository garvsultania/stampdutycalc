import { describe, expect, it } from "vitest";
import { WatchdogError } from "./errors.js";
import { discoverMaharashtraIgrPublicationEndpoints } from "./igr-maharashtra.js";

describe("IGR Maharashtra publication discovery", () => {
  it("classifies official publication-family navigation without claiming documents", () => {
    const endpoints = discoverMaharashtraIgrPublicationEndpoints(`
      <a href="/Marathi/acts">कायदे</a>
      <a href="/Marathi/rules">नियम</a>
      <a href="/Marathi/notifications">अधिसूचना</a>
      <a href="/Marathi/government_resolutions">शासन निर्णय</a>
      <a href="/Marathi/circulars">परिपत्रके</a>
      <a href="/Marathi/valuation_rates">मूल्यांकन दर</a>
      <a href="/Marathi/fee_table">शुल्क तक्ता</a>
      <a href="/Marathi/reports">अहवाल</a>
      <a href="/Marathi/circulars">परिपत्रके</a>
    `, "https://igrmaharashtra.gov.in/Marathi/publication");

    expect(endpoints.map((endpoint) => endpoint.family)).toEqual([
      "acts_schedules",
      "circulars",
      "fee_tables",
      "government_resolutions",
      "notifications",
      "reports",
      "rules",
      "valuation_rates",
    ]);
    expect(endpoints.every((endpoint) => endpoint.url.startsWith("https://igrmaharashtra.gov.in/"))).toBe(true);
  });

  it("fails closed when the expected publication navigation disappears", () => {
    expect(() => discoverMaharashtraIgrPublicationEndpoints(
      `<a href="/Marathi/contact">Contact</a>`,
      "https://igrmaharashtra.gov.in/Marathi/publication",
    )).toThrowError(WatchdogError);
  });
});
