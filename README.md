# StampDraft

India's stamp duty computation engine. The product is the consolidated, versioned,
citation-backed, **computable** table of stamp duty law; computation is a thin,
deterministic, zero-LLM layer on top of it. See [`stampdraft-prd.md`](./stampdraft-prd.md)
for the full spec and [`DECISIONS.md`](./DECISIONS.md) for deviations.

## Layout

```
packages/
  schema/    @stampdraft/schema  — rules-as-data types + Zod validators (the contract)
  engine/    @stampdraft/engine  — pure, deterministic, LLM-free computation library
  cli/       @stampdraft/cli     — stampdraft CLI (scriptable golden verification)
rules/<STATE>/     append-only, PR-reviewed rule data     (DL/MH/KA — populated M1+)
golden/<STATE>/    lawyer-verified scenarios (ship gate)  (populated M1+)
scripts/           CI gates: validate-rules, run-golden
```

## Invariants (non-negotiable)

1. Zero LLM in the computation path. Deterministic and pure.
2. Append-only rule versioning; cross-refs resolve only within a version snapshot.
3. No rule activates without a source citation (schema-enforced).
4. Every output records the `rules_version` hash and is reproducible from {inputs, hash}.

## Develop

```bash
pnpm install
pnpm check          # typecheck + validate:rules + golden + test  (the full gate)
pnpm test           # unit + synthetic golden suite (M0 gate)
```

## CLI

```bash
pnpm --filter @stampdraft/cli build
node packages/cli/dist/index.js validate --rules rules/DL
node packages/cli/dist/index.js golden   --rules rules/DL --golden golden/DL
node packages/cli/dist/index.js hash     --rules rules/DL --state DL --date 2026-07-15
node packages/cli/dist/index.js compute  --rules rules/DL --input matter.json
```

## Status

**M0 (Foundations) complete.** Schema + validators, deterministic engine core
(all base/rate/modifier types, formula lease bases, slabs, caps, min-duty,
snapshot-scoped cross-refs, penalty ranges, classification trees), and a golden-test
harness wired into CI. Next gate: **M1 — Delhi end-to-end.**
