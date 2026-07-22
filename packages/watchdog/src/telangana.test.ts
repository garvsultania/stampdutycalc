import { describe, expect, it } from "vitest";
import { WatchdogError } from "./errors.js";
import { inspectTelanganaGoirForm } from "./telangana.js";

const fixture = `
<form>
  <input type="hidden" name="__VIEWSTATE" value="state">
  <select name="department"><option value="REV">REVENUE</option></select>
  <select name="goType"><option value="MS">MS</option><option value="RT">RT</option></select>
  <select name="year"><option value="2026">2026</option><option value="2021">2021</option></select>
</form>`;

describe("Telangana official Government Orders", () => {
  it("pins direct Revenue and both published order types", () => {
    expect(inspectTelanganaGoirForm(fixture).department).toEqual({ name: "department", value: "REV" });
  });

  it("does not silently continue if the order form changes", () => {
    expect(() => inspectTelanganaGoirForm(fixture.replace('<option value="RT">RT</option>', ""))).toThrowError(WatchdogError);
  });
});
