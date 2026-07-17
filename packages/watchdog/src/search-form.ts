import { WatchdogError } from "./errors.js";
import { attributes } from "./html.js";

export interface SearchControl {
  name: string;
  type: "hidden" | "select" | "text";
  options?: Array<{ value: string; label: string }>;
  value?: string;
}

export function inspectSearchControls(html: string): SearchControl[] {
  const controls: SearchControl[] = [];
  for (const input of html.matchAll(/<input\b[^>]*>/gi)) {
    const attrs = attributes(input[0]);
    if (!attrs.name) continue;
    const type = attrs.type?.toLowerCase() === "hidden" ? "hidden" : "text";
    controls.push({ name: attrs.name, type, ...(attrs.value === undefined ? {} : { value: attrs.value }) });
  }
  for (const select of html.matchAll(/(<select\b[^>]*>)([\s\S]*?)<\/select>/gi)) {
    const attrs = attributes(select[1]!);
    if (!attrs.name) continue;
    const options = [...select[2]!.matchAll(/(<option\b[^>]*>)([\s\S]*?)<\/option>/gi)].map((option) => ({
      value: attributes(option[1]!).value ?? "",
      label: option[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    }));
    controls.push({ name: attrs.name, type: "select", options });
  }
  if (controls.length === 0) throw new WatchdogError("Government search form contained no named controls", "shape_drift");
  return controls;
}

export function selectOption(
  controls: SearchControl[],
  label: RegExp,
  description: string,
): { name: string; value: string } {
  const matches = controls
    .filter((control) => control.type === "select")
    .flatMap((control) => (control.options ?? [])
      .filter((option) => label.test(option.label))
      .map((option) => ({ name: control.name, value: option.value })));
  if (matches.length !== 1) {
    throw new WatchdogError(`Expected exactly one search option for ${description}; found ${matches.length}`, "shape_drift");
  }
  return matches[0]!;
}
