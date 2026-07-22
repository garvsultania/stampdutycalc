import { describe, expect, it } from "vitest";
import { ocrLanguages } from "./ocr.js";

describe("recorded OCR policy", () => {
  it("selects local language packs without replacing the original evidence", () => {
    expect(ocrLanguages("dl-revenue-notifications")).toEqual(["hin", "eng"]);
    expect(ocrLanguages("tn-gazette-extraordinary")).toEqual(["tam", "eng"]);
    expect(ocrLanguages("gj-egazette")).toEqual(["guj", "eng"]);
    expect(ocrLanguages("tg-goir-revenue")).toEqual(["tel", "urd", "eng"]);
  });
});
