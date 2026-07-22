import type { ComputeInput, ComputeOutput } from "@stampdraft/schema";
import { compute, type ComputeOptions } from "./compute.js";
import { num, canonical, type Num } from "./money.js";
import type { RuleSet } from "./snapshot.js";

export interface DifferentialResult {
  execution_state: string;
  property_state: string;
  /** Duty chargeable/paid in the state of execution (the credit). */
  duty_execution_state: string;
  /** Duty chargeable in the state where the property is situate. */
  duty_property_state: string;
  /** max(0, duty_property − duty_execution) — what is actually payable in the property state. */
  differential_payable: string;
  /** Set when execution-state duty exceeds property-state duty (excess is NOT refunded). */
  excess_note: string | null;
  execution_output: ComputeOutput;
  property_output: ComputeOutput;
  warnings: string[];
}

/**
 * Inter-state differential duty (PRD §5.4; Indian Stamp Act s.19A and state
 * equivalents). An instrument executed in State A relating to property situate in
 * State B, when brought into State B, is chargeable in B with the duty under B's
 * law LESS the duty already paid in A — i.e. a credit, with the differential
 * payable in B. If A's duty exceeds B's, the excess is NOT refunded.
 *
 * The caller supplies the SAME instrument as two ComputeInputs — one under each
 * state's law (different jurisdiction + rule_id, same commercial facts). This is
 * a daily real-world scenario that naive calculators mishandle; modelled as a
 * dedicated module rather than folded into a single computation because it is two
 * genuine computations plus a credit rule.
 */
export function computeInterStateDifferential(
  ruleSet: RuleSet,
  executionInput: ComputeInput,
  propertyInput: ComputeInput,
  opts: { execution?: ComputeOptions; property?: ComputeOptions } = {},
): DifferentialResult {
  const executionOut = compute(ruleSet, executionInput, opts.execution);
  const propertyOut = compute(ruleSet, propertyInput, opts.property);

  const dutyA: Num = num(executionOut.total_duty);
  const dutyB: Num = num(propertyOut.total_duty);
  const rawDiff = dutyB.minus(dutyA);
  const differential = rawDiff.greaterThan(0) ? rawDiff : num(0);

  const excessNote = dutyA.greaterThan(dutyB)
    ? `Duty of ₹${canonical(dutyA)} in ${executionInput.jurisdiction} exceeds duty of ₹${canonical(dutyB)} in ${propertyInput.jurisdiction} by ₹${canonical(dutyA.minus(dutyB))}. The differential mechanism does not refund the excess; nil is payable in ${propertyInput.jurisdiction}.`
    : null;

  const warnings = [
    `Differential assumes the ${executionInput.jurisdiction} duty of ₹${canonical(dutyA)} was in fact paid (proper stamping in the state of execution). If the instrument was under-stamped in ${executionInput.jurisdiction}, the credit is limited to the duty actually paid, and a separate deficit arises there.`,
  ];

  return {
    execution_state: executionInput.jurisdiction,
    property_state: propertyInput.jurisdiction,
    duty_execution_state: canonical(dutyA),
    duty_property_state: canonical(dutyB),
    differential_payable: canonical(differential),
    excess_note: excessNote,
    execution_output: executionOut,
    property_output: propertyOut,
    warnings,
  };
}
