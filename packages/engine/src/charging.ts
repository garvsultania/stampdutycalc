import type { ChargingRules, Citation, ComputeInput, ComputeOutput } from "@stampdraft/schema";
import { canonical, num, ZERO, type Num } from "./money.js";
import { compute, type ComputeOptions } from "./compute.js";
import { EngineError } from "./errors.js";
import type { RuleSet } from "./snapshot.js";

/** One instrument in a multi-instrument analysis, with a human label for the memo. */
export interface NamedInstrument {
  label: string;
  input: ComputeInput;
  options?: ComputeOptions;
}

interface Priced extends NamedInstrument {
  output: ComputeOutput;
  duty: Num;
}

function priceAll(ruleSet: RuleSet, instruments: NamedInstrument[]): Priced[] {
  if (instruments.length === 0) throw new EngineError("no instruments supplied");
  return instruments.map((i) => {
    const output = compute(ruleSet, i.input, i.options);
    return { ...i, output, duty: num(output.total_duty) };
  });
}

function maxIndex(priced: Priced[]): number {
  let best = 0;
  for (let i = 1; i < priced.length; i++) if (priced[i]!.duty.greaterThan(priced[best]!.duty)) best = i;
  return best;
}

// ————————————————————————————————————————————————————————— s.4

export interface S4Result {
  section: "4";
  transaction_type: string;
  /** The instrument the parties (or the officer) nominated as principal. */
  principal: { label: string; charged: string; own_duty: string; output: ComputeOutput };
  /** Every other instrument, charged the flat nominal duty instead of its own. */
  others: Array<{ label: string; charged: string; own_duty_would_be: string }>;
  total: string;
  /** How the principal was picked: nominated by the parties, or defaulted to the highest. */
  principal_selection: "nominated" | "highest_duty_default";
  warnings: string[];
  citations: Citation[];
}

/**
 * s.4 — several instruments completing a SINGLE transaction (PRD §5.4).
 *
 * The principal instrument alone bears the Schedule duty; every other instrument
 * bears a flat nominal duty. Two subtleties the section actually turns on, both
 * modelled here rather than assumed away:
 *
 *  1. The proviso: whichever instrument the parties nominate as principal, "the
 *     duty chargeable on the instrument so determined shall be the HIGHEST duty
 *     which would be chargeable in respect of any of the said instruments". So
 *     nominating the cheap instrument does not buy a cheaper transaction — the
 *     nominee is charged the highest duty in the set. Nominating a non-highest
 *     instrument is therefore never advantageous, and we warn when it happens.
 *  2. `transaction_types` is per-state: Maharashtra's s.4 reaches development
 *     agreements and leases; Delhi's and Karnataka's do not. Asking for s.4
 *     relief on a transaction type outside the state's list is an escalation,
 *     not a silent grant.
 */
export function computeS4(
  ruleSet: RuleSet,
  charging: ChargingRules,
  instruments: NamedInstrument[],
  opts: { transactionType: string; principalIndex?: number } = { transactionType: "sale" },
): S4Result {
  if (instruments.length < 2) {
    throw new EngineError("s.4 applies where SEVERAL instruments complete one transaction — supply at least two");
  }
  if (!charging.s4.transaction_types.includes(opts.transactionType)) {
    throw new EngineError(
      `s.4 in ${charging.jurisdiction} covers only ${charging.s4.transaction_types.join(", ")} — it does not extend to "${opts.transactionType}", so each instrument bears its own full duty`,
    );
  }

  const priced = priceAll(ruleSet, instruments);
  const highestIdx = maxIndex(priced);
  const nominatedIdx = opts.principalIndex ?? highestIdx;
  if (nominatedIdx < 0 || nominatedIdx >= priced.length) {
    throw new EngineError(`principalIndex ${nominatedIdx} is out of range`);
  }

  const principal = priced[nominatedIdx]!;
  const highestDuty = priced[highestIdx]!.duty; // the proviso's charge on the principal
  const nominal = num(charging.s4.nominal_duty);

  const warnings: string[] = [];
  if (nominatedIdx !== highestIdx) {
    warnings.push(
      `"${principal.label}" was nominated as the principal instrument, but its own duty (₹${canonical(principal.duty)}) is not the highest in the set. Under the s.4 proviso the nominated instrument is charged the HIGHEST duty of any instrument employed (₹${canonical(highestDuty)}, from "${priced[highestIdx]!.label}"), so the nomination does not reduce the duty.`,
    );
  }

  const others = priced
    .filter((_, i) => i !== nominatedIdx)
    .map((p) => ({ label: p.label, charged: canonical(nominal), own_duty_would_be: canonical(p.duty) }));

  const total = highestDuty.plus(nominal.times(others.length));

  return {
    section: "4",
    transaction_type: opts.transactionType,
    principal: {
      label: principal.label,
      charged: canonical(highestDuty),
      own_duty: canonical(principal.duty),
      output: principal.output,
    },
    others,
    total: canonical(total),
    principal_selection: opts.principalIndex === undefined ? "highest_duty_default" : "nominated",
    warnings,
    citations: [charging.s4.source, ...principal.output.citations],
  };
}

// ————————————————————————————————————————————————————————— s.5

export interface S5Result {
  section: "5";
  matters: Array<{ label: string; duty: string; output: ComputeOutput }>;
  total: string;
  citations: Citation[];
}

/**
 * s.5 — ONE instrument comprising several DISTINCT matters: chargeable with the
 * aggregate of the duties each matter would bear separately (PRD §5.4).
 *
 * The hard part is legal, not arithmetic: whether the matters are truly "distinct"
 * (s.5 → aggregate) or one transaction described two ways (s.6 → highest). That
 * determination belongs to the practitioner; this function computes the s.5 answer
 * once they have made it, and `compareS5S6` shows both side by side.
 */
export function computeS5(ruleSet: RuleSet, matters: NamedInstrument[]): S5Result {
  if (matters.length < 2) {
    throw new EngineError("s.5 applies to an instrument covering SEVERAL distinct matters — supply at least two");
  }
  const priced = priceAll(ruleSet, matters);
  const total = priced.reduce((acc, p) => acc.plus(p.duty), ZERO);
  return {
    section: "5",
    matters: priced.map((p) => ({ label: p.label, duty: canonical(p.duty), output: p.output })),
    total: canonical(total),
    citations: priced.flatMap((p) => p.output.citations),
  };
}

// ————————————————————————————————————————————————————————— s.6

export interface S6Result {
  section: "6";
  descriptions: Array<{ label: string; duty: string; chargeable: boolean; output: ComputeOutput }>;
  /** The highest duty — what the instrument actually bears under s.6. */
  total: string;
  /** True when two or more descriptions tie at the highest duty (s.6 is then moot). */
  tied: boolean;
  warnings: string[];
  citations: Citation[];
}

/**
 * s.6 — an instrument framed so as to come within TWO OR MORE descriptions in the
 * Schedule is chargeable only with the HIGHEST of those duties (PRD §5.4).
 *
 * This is the computational half of every grey zone the classification trees
 * escalate: when the tree cannot decide between (say) lease and leave-&-licence,
 * s.6 says charge the higher. Feeding both candidate descriptions in here turns an
 * unresolved classification into a defensible, conservative number.
 */
export function computeS6(ruleSet: RuleSet, descriptions: NamedInstrument[]): S6Result {
  if (descriptions.length < 2) {
    throw new EngineError("s.6 applies where an instrument falls within TWO OR MORE descriptions — supply at least two");
  }
  const priced = priceAll(ruleSet, descriptions);
  const bestIdx = maxIndex(priced);
  const highest = priced[bestIdx]!.duty;
  const tied = priced.filter((p) => p.duty.equals(highest)).length > 1;

  const warnings: string[] = [];
  if (tied) {
    warnings.push(
      "Two or more competing descriptions attract the same duty, so s.6 does not change the amount — but the classification may still matter for registration, admissibility and multi-state execution.",
    );
  }

  return {
    section: "6",
    descriptions: priced.map((p, i) => ({
      label: p.label,
      duty: canonical(p.duty),
      chargeable: i === bestIdx,
      output: p.output,
    })),
    total: canonical(highest),
    tied,
    warnings,
    citations: priced[bestIdx]!.output.citations,
  };
}

// ————————————————————————————————————————————————————————— s.5 vs s.6

export interface S5S6Comparison {
  s5: S5Result;
  s6: S6Result;
  difference: string;
  guidance: string;
}

/**
 * The practitioner's real question in a grey zone: is this ONE instrument covering
 * two DISTINCT matters (s.5 — aggregate), or one matter answering to TWO
 * DESCRIPTIONS (s.6 — highest)? The answer can differ by the whole of the smaller
 * duty. StampDraft will not decide it — it shows both, and names the test.
 */
export function compareS5S6(ruleSet: RuleSet, candidates: NamedInstrument[]): S5S6Comparison {
  const s5 = computeS5(ruleSet, candidates);
  const s6 = computeS6(ruleSet, candidates);
  const difference = canonical(num(s5.total).minus(num(s6.total)));
  return {
    s5,
    s6,
    difference,
    guidance:
      "s.5 aggregates the duties of genuinely DISTINCT matters; s.6 charges only the highest where ONE matter answers to several descriptions. The distinction is a question of construction for the practitioner — StampDraft computes both rather than choosing.",
  };
}
