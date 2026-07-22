import { WatchdogError } from "./errors.js";
import { inspectSearchControls, selectOption } from "./search-form.js";

export interface TelanganaGoirForm {
  department: { name: string; value: string };
  controls: ReturnType<typeof inspectSearchControls>;
}

export function inspectTelanganaGoirForm(html: string): TelanganaGoirForm {
  const controls = inspectSearchControls(html);
  const department = selectOption(controls, /^REVENUE$/i, "Telangana Revenue department");
  const labels = controls.flatMap((control) => control.options?.map((option) => option.label) ?? []);
  if (!labels.some((label) => /^MS$/i.test(label)) || !labels.some((label) => /^RT$/i.test(label))) {
    throw new WatchdogError("Telangana GOIR form no longer exposes both MS and RT order types", "shape_drift");
  }
  return { department, controls };
}
