import { describe, expect, it } from "vitest";
import { WatchdogError } from "./errors.js";
import { inspectSearchControls, selectOption } from "./search-form.js";

describe("government search forms", () => {
  it("identifies Telangana Revenue without claiming a gazette source", () => {
    const controls = inspectSearchControls(`
      <input type="hidden" name="__VIEWSTATE" value="state">
      <select name="department">
        <option value="">Select</option>
        <option value="REV">Revenue</option>
        <option value="LAW">Law</option>
      </select>
      <input name="fromDate" type="text">
      <input name="toDate" type="text">`);

    expect(selectOption(controls, /^Revenue$/i, "Telangana Revenue department")).toEqual({
      name: "department",
      value: "REV",
    });
  });

  it("fails loudly when department options drift or become ambiguous", () => {
    const controls = inspectSearchControls('<select name="department"><option value="OTHER">Other</option></select>');
    expect(() => selectOption(controls, /^Revenue$/i, "Telangana Revenue department")).toThrowError(WatchdogError);
    expect(() => inspectSearchControls("<html>Unavailable</html>")).toThrowError(WatchdogError);
  });
});
