import type { ComputeInput, InputField, Rule } from "@stampdraft/schema";
import { inputContractActiveOn } from "@stampdraft/schema";
import { EngineError } from "./errors.js";
import { evalCondition } from "./condition.js";
import type { Num } from "./money.js";

export function assertInputContract(rule: Rule, input: ComputeInput): void {
  const contract = rule.input_contract;
  if (!contract) return;
  if (
    contract.jurisdiction !== input.jurisdiction ||
    contract.rule_id !== input.rule_id ||
    !inputContractActiveOn(contract, input.execution_date)
  ) {
    throw new EngineError(`input contract does not match ${input.jurisdiction}/${input.rule_id} on ${input.execution_date}`);
  }

  const valueFields = contract.fields.filter((field) => field.kind === "value");
  const factFields = contract.fields.filter((field) => field.kind === "fact");
  assertKnownKeys("value", Object.keys(input.values), valueFields);
  assertKnownKeys("fact", Object.keys(input.facts), factFields);

  for (const field of valueFields) {
    const value = input.values[field.key];
    if (value === undefined) {
      if (field.required) {
        throw new EngineError(`missing required value "${field.key}" for ${rule.rule_id}`, "INPUT_REQUIRED");
      }
      continue;
    }
    if (field.type === "money") {
      if (!isNonNegativeDecimal(value)) {
        throw new EngineError(`value "${field.key}" must be a non-negative decimal amount`, "INPUT_REQUIRED");
      }
    } else if (!isPositiveInteger(value)) {
      throw new EngineError(`value "${field.key}" must be a positive integer`, "INPUT_REQUIRED");
    }
  }

  for (const field of factFields) {
    const value = input.facts[field.key];
    if (value === undefined) {
      if (field.required) {
        throw new EngineError(`missing required fact "${field.key}" for ${rule.rule_id}`, "INPUT_REQUIRED");
      }
      continue;
    }
    const allowed = field.options.map((option) => option.value);
    if (typeof value !== "string" || !allowed.includes(value)) {
      throw new EngineError(
        `fact "${field.key}" must be one of: ${allowed.map((option) => `"${option}"`).join(", ")}`,
        "INPUT_REQUIRED",
      );
    }
  }
}

export function deriveInputFacts(
  rule: Rule,
  input: ComputeInput,
  values: Record<string, Num>,
): Record<string, string | number> {
  const facts = { ...input.facts };
  for (const derived of rule.input_contract?.derived_facts ?? []) {
    const matches = derived.cases.filter((candidate) =>
      evalCondition(candidate.when, facts, input.execution_date, values),
    );
    if (matches.length > 1) {
      throw new EngineError(`derived fact "${derived.key}" has multiple matching cases for ${rule.rule_id}`);
    }
    facts[derived.key] = matches[0]?.value ?? derived.default;
  }
  return facts;
}

function assertKnownKeys(
  kind: "value" | "fact",
  supplied: string[],
  fields: InputField[],
): void {
  const allowed = new Set(fields.map((field) => field.key));
  const unknown = supplied.filter((key) => !allowed.has(key)).sort();
  if (unknown.length > 0) {
    throw new EngineError(
      `unknown input ${kind}${unknown.length === 1 ? "" : "s"}: ${unknown.map((key) => `"${key}"`).join(", ")}`,
      "INPUT_REQUIRED",
    );
  }
}

function isNonNegativeDecimal(value: string | number): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0;
  return /^\d+(\.\d+)?$/.test(value);
}

function isPositiveInteger(value: string | number): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value > 0;
  return /^[1-9]\d*$/.test(value);
}
