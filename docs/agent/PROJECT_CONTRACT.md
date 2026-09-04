# Project Contract

## Purpose

This repository produces `dsh-plugin-dev`: a reusable development Skill, a project-level version-compatibility analysis companion, a skills-only Codex Plugin, and deterministic helpers for DeepSeek Harness plugin projects. A developer installs the development skill once, opens either code agent in an empty or existing project directory, describes the desired capability, and receives a DSH-aligned implementation scaffold plus verification. Maintainers use the companion to assess upstream evolution without first changing the audited baseline.

This repository is development tooling for DSH plugins. It is not itself a DSH runtime plugin and does not own a product-specific Agent Team capability.

## Sources of truth

| Concern | Authoritative file |
|---|---|
| Always-active repository rules | `docs/agent/PROJECT_CONTRACT.md` |
| DSH development and generation workflow | `skills/dsh-plugin-dev/SKILL.md` |
| Version-adaptive compatibility analysis | `skills/version-compatibility-analysis/SKILL.md` and its `src/` |
| Specialized DSH guidance | `skills/dsh-plugin-dev/references/` |
| Deterministic generation source and assets | `skills/dsh-plugin-dev/src/` and `assets/` |
| Current work and progress | `TODO.md` |
| Settled product and delivery decisions | `docs/decisions/` |
| Audited upstream baselines | `dsh-reference.lock.json` and `baselines/` |
| Mechanical repository validation | `src/scripts/verify-context.mts`, compiled as `scripts/verify-context.mjs` |

Discovery adapters and plugin metadata point at these sources but do not duplicate their policy.

## Required startup protocol

1. Read this contract and `TODO.md` completely.
2. Run `pnpm context:check` before planning or editing.
3. For DSH work, load `dsh-plugin-dev` and only the references selected by it.
4. Inspect the worktree before changing files and preserve unrelated user work.
5. Run `pnpm context:check:strict` before implementing or claiming behavior tied to the audited Harness snapshot.
6. Work from the first relevant unfinished TODO and update it as observable work advances.

An unavailable or mismatched baseline blocks pinned-runtime implementation and
compatibility claims, not the companion's read-only comparison of committed
objects. Report the gate failure before continuing that diagnostic scope.
Version-independent analysis tooling can be maintained and fixture-tested
separately; never label those checks as Harness runtime verification.

## Product contract

- One default user-level installation makes the canonical skill discoverable from an unrelated empty directory in both Codex (`$HOME/.agents/skills`) and Claude Code (`$HOME/.claude/skills`); repository-local discovery is not sufficient acceptance.
- The compatibility companion is project-level, with thin Codex/Claude Code
  adapters and inclusion in the packaged Plugin. The existing user installer
  installs only the development skill; it does not implicitly add the companion
  globally. Both canonical bodies are maintained in `skills/`.
- Compatibility analysis refreshes its knowledge from the selected lock,
  candidate Git objects, workspace definitions, dependency declarations,
  source and tests on every invocation. New upstream versions do not require
  editing a version list or promoting a baseline before analysis. Unknown
  formats receive explicit evidence gaps and an Agent-led read-only fallback.
  Analysis never self-modifies the skill, installs/executes upstream skill
  instructions, or automatically writes locks and verification evidence.
- The skill begins from the requested user-visible or model-visible outcome, classifies the required DSH plugin shape, and loads only the applicable guidance.
- A deterministic generator may create a safe baseline, but the agent must adapt it to the stated business behavior and tests before claiming the request is complete.
- Generators validate names, resolve the selected audited source or Registry delivery contract, refuse collisions, and never overwrite an existing project file implicitly.
- Generated projects carry their own DSH reference lock, thin `AGENTS.md` and
  `CLAUDE.md` discovery adapters, shared startup contract, TODO, runtime
  configuration schema, lifecycle test, Loader composition test, and bundle
  patch when applicable.
- The first deterministic vertical slice is a Host-side model-facing Tool plugin. Other plugin shapes remain guided workflows until their templates have equivalent external-world acceptance.
- Generation defaults to the content-addressed `stable` DSH channel. A new
  official tag enters `edge`, invalidates prior candidate evidence, and cannot
  replace stable until its Registry closure and full verification reports pass.
- Installation and generation do not train or mutate the model. They supply progressively disclosed instructions, references, scripts, and templates.

## Delivery constraint

The Tool generator supports two explicit delivery modes. `source` remains the
default local audit/development route: it links the exact Harness checkout in
`dsh-reference.lock.json`, keeps the generated package private, requires clean
tracked/non-ignored source with no root `.env`, and validates present/fresh
JavaScript and type entries. Ignored dependency/build output remains allowed.

`registry` is permitted only when the selected channel's digest-bound Tool
closure report is `ready`. It emits exact ordinary dependency versions, no
`link:`/`workspace:` specifications, a non-private public package baseline, and
a copied `dsh-registry.lock.json`. Publication readiness additionally requires
the project-specific business implementation plus clean archive install/import
and real profile add/dump/boot/remove verification for the exact artifact.

## DSH invariants

- A DSH plugin is a Cordis lifecycle unit composed by Loader/profile patches; it does not create a parallel application launcher.
- Namespace function plugins named-export `name`, `inject`, `Config`, and `apply` as needed and do not add `export default apply`. Service-class plugins may default-export the service class.
- Required topology is declared through `inject`. Optional global lookup uses `ctx.get(name)`; optional scoped composition may use a child `ctx.inject`.
- Every configurable field has a TypeScript contract and runtime Schemastery schema. Defaults belong in the schema; unsupported deployment choices remain required.
- Every registration, listener, timer, worker, request, and external resource has lifecycle-owned cleanup. Disposal stops admission and awaits quiescence.
- Durable Session events are facts. Projections are pure, synchronous, whole JSON values derived from those facts; UI state is not a second authority.
- Unknown persisted Session events are not portable by declaration merging.
  Current-format recovery requires an explicit `ignorable: true` envelope;
  historical migration may refuse even that envelope. Apply the selected
  revision's rules in `references/version-contracts.md`; the surface event set
  remains closed.
- Tools declare parameter and canonical output schemas, preserve call identity, honor `AbortSignal`, and separate domain outcomes from infrastructure errors.
- Browser extensions use `exports["./client"]`, `dsh.client`, generated Remote contracts where needed, and Slots. React components do not receive Cordis Context or import another feature's runtime component.
- A product-visible change requires a real Loader/profile test in addition to unit and HMR tests. Publication requires a packed-artifact ordinary-Node smoke test.

## Change discipline

- Prefer one verified generator vertical slice over speculative templates for every plugin type.
- Keep reusable DSH facts in the canonical skill references; keep generator mechanics in TypeScript source and output templates.
- Treat `src/**/*.mts`, `skills/*/src/**/*.mts`, and TypeScript
  tests as authoritative implementation. The public `.mjs`/`.d.mts` entries
  are generated, dependency-free distribution artifacts; never edit them by
  hand. Run `pnpm build`, and require `pnpm build:check` plus the
  digest-bound `tooling-artifacts.json` before acceptance.
- Do not encode a local absolute Harness path as a universal default. Source projects record a relocatable fallback plus `DSH_HARNESS_ROOT` and use `context:sync` after a move. Registry projects have no source root or sync command and migrate only through reviewed catalog/evidence changes.
- Add an abstraction only for a current provider/consumer, Host/Client, or deterministic-generation boundary.
- Update tests, TODO, installation documentation, and a decision record with the behavior they govern.
- Update an audited Harness baseline only through the clean tagged-worktree
  workflow in `docs/agent/BASELINE_UPGRADE.md`; never edit stable directly.

## Completion reporting

Report the observable developer experience first, then validation performed, supported scaffold types, remaining TODO, and any version-lock or delivery blocker. Never claim DSH compatibility after the applicable strict source/Registry validation fails, and never claim publication readiness from source-linked tests or a Registry lookup without exact archive/profile evidence.
