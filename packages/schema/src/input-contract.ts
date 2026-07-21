import { z } from "zod";
import { ISODateSchema, JurisdictionSchema } from "./primitives.js";
import { ConditionSchema } from "./condition.js";

const InputOptionSchema = z
  .object({
    value: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

export const InputValueFieldSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    kind: z.literal("value"),
    type: z.enum(["money", "positive_integer"]),
    help: z.string().min(1).optional(),
    required: z.boolean().default(true),
  })
  .strict();

export const InputFactFieldSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    kind: z.literal("fact"),
    type: z.literal("select"),
    help: z.string().min(1).optional(),
    required: z.boolean().default(true),
    options: z.array(InputOptionSchema).min(1),
  })
  .strict()
  .superRefine((field, ctx) => {
    const values = field.options.map((option) => option.value);
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "option values must be unique", path: ["options"] });
    }
  });

export const InputFieldSchema = z.union([InputValueFieldSchema, InputFactFieldSchema]);
export type InputField = z.infer<typeof InputFieldSchema>;

const DerivedFactValueSchema = z.union([z.string(), z.number()]);

export const DerivedFactSchema = z
  .object({
    key: z.string().min(1),
    cases: z.array(z.object({
      when: ConditionSchema,
      value: DerivedFactValueSchema,
    }).strict()).min(1),
    default: DerivedFactValueSchema,
  })
  .strict();
export type DerivedFact = z.infer<typeof DerivedFactSchema>;

export const RuleInputContractSchema = z
  .object({
    jurisdiction: JurisdictionSchema,
    rule_id: z.string().min(1),
    effective_from: ISODateSchema,
    effective_to: ISODateSchema.nullable(),
    fields: z.array(InputFieldSchema),
    derived_facts: z.array(DerivedFactSchema).default([]),
  })
  .strict()
  .superRefine((contract, ctx) => {
    if (contract.effective_to !== null && contract.effective_to <= contract.effective_from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "effective_to must be strictly after effective_from",
        path: ["effective_to"],
      });
    }
    const keys = contract.fields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "field keys must be unique", path: ["fields"] });
    }
    const derivedKeys = contract.derived_facts.map((fact) => fact.key);
    if (new Set(derivedKeys).size !== derivedKeys.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "derived fact keys must be unique", path: ["derived_facts"] });
    }
    const shadowed = derivedKeys.filter((key) => keys.includes(key));
    if (shadowed.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `derived facts cannot shadow caller fields: ${shadowed.join(", ")}`,
        path: ["derived_facts"],
      });
    }
  });

export type RuleInputContract = z.infer<typeof RuleInputContractSchema>;

export function inputContractActiveOn(contract: RuleInputContract, date: string): boolean {
  return contract.effective_from <= date && (contract.effective_to === null || date < contract.effective_to);
}
