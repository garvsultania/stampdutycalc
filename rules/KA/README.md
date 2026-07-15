This directory holds append-only, PR-reviewed rule data for the state. Convention:
  rules/            Rule | Rule[]              (one instrument per file)
  modifiers/        Modifier | Modifier[]
  classification/   ClassificationTree | ClassificationTree[]
  penalty.json      PenaltyRegime | PenaltyRegime[]

Every active rule MUST carry a source citation (schema-enforced). Populated in M1+.
