import { describe, expect, it } from "vitest";
import { WatchdogError } from "./errors.js";
import { parseKarnatakaActPage, requireKarnatakaActs } from "./karnataka.js";

const page = `
<a href="/uploads/media_to_upload1748848611.pdf">ಕರ್ನಾಟಕ ಸ್ಟಾಂಪು (ತಿದ್ದುಪಡಿ) ಅಧಿನಿಯಮ, 2025</a>
<a href="/uploads/media_to_upload1749196066.pdf">THE KARNATAKA STAMP (AMENDMENT) ACT, 2025 (KARNATAKA ACT NO. 30 OF 2025)</a>
<a href="/uploads/media_to_upload1747719771.pdf">Gazette — 30 of 2025</a>
<a href="/uploads/media_to_upload1756446525.pdf">THE REGISTRATION (KARNATAKA AMENDMENT) ACT, 2025 (KARNATAKA ACT NO. 42 OF 2025)</a>
<a href="/uploads/media_to_upload1754375523.pdf">Gazette — 42 of 2025</a>`;

describe("Karnataka DPAL Acts", () => {
  it("groups direct official language and Gazette PDFs by Act number", () => {
    const groups = parseKarnatakaActPage(page, "https://dpal.karnataka.gov.in/79/2025/en");

    expect(groups.map((group) => `${group.actNumber}/${group.year}`)).toEqual(["30/2025", "42/2025"]);
    expect(groups.find((group) => group.actNumber === 30)?.rows).toHaveLength(2);
    expect(() => requireKarnatakaActs(groups, [{ actNumber: 30, year: 2025 }, { actNumber: 42, year: 2025 }])).not.toThrow();
  });

  it("fails when a known direct Act disappears", () => {
    const groups = parseKarnatakaActPage(page, "https://dpal.karnataka.gov.in/79/2025/en");
    expect(() => requireKarnatakaActs(groups, [{ actNumber: 4, year: 2024 }])).toThrowError(WatchdogError);
  });
});
