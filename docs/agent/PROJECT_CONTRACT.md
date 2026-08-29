# Project Contract

## Purpose

This repository produces `dsh-plugin-dev`: one reusable Agent Skill for Codex and Claude Code, a skills-only Codex Plugin, and deterministic helpers that turn business requirements into DeepSeek Harness plugin projects. A developer installs the skill once, opens either code agent in an empty or existing project directory, describes the desired capability, and receives a DSH-aligned implementation scaffold plus verification.

This repository is development tooling for DSH plugins. It is not itself a DSH runtime plugin and does not own a product-specific Agent Team capability.

## Sources of truth

| Concern | Authoritative file |
|---|---|
| Always-active repository rules | `docs/agent/PROJECT_CONTRACT.md` |
| DSH development and generation workflow | `skills/dsh-plugin-dev/SKILL.md` |
| Specialized DSH guidance | `skills/dsh-plugin-dev/references/` |
| Deterministic generation code and assets | `skills/dsh-plugin-dev/scripts/` and `assets/` |
| Current work and progress | `TODO.md` |
| Settled product and delivery decisions | `docs/decisions/` |
| Audited upstream baseline | `dsh-reference.lock.json` |
| Mechanical repository validation | `scripts/verify-context.mjs` |

Discovery adapters and plugin metadata point at these sources but do not duplicate their policy.

## Required startup protocol

1. Read this contract and `TODO.md` completely.
2. Run `pnpm context:check` before planning or editing.
3. For DSH work, load `dsh-plugin-dev` and only the references selected by it.
4. Inspect the worktree before changing files and preserve unrelated user work.
5. Run `pnpm context:check:strict` before implementing or claiming behavior tied to the audited Harness snapshot.
6. Work from the first relevant unfinished TODO and update it as observable work advances.

## Product contract

- One default user-level installation makes the canonical skill discoverable from an unrelated empty directory in both Codex (`$HOME/.agents/skills`) and Claude Code (`$HOME/.claude/skills`); repository-local discovery is not sufficient acceptance.
- The skill begins from the requested user-visible or model-visible outcome, classifies the required DSH plugin shape, and loads only the applicable guidance.
- A deterministic generator may create a safe baseline, but the agent must adapt it to the stated business behavior and tests before claiming the request is complete.
- Generators validate names, resolve the pinned Harness source, refuse collisions, and never overwrite an existing project file implicitly.
- Generated projects carry their own DSH reference lock, startup contract, TODO, runtime configuration schema, lifecycle test, Loader composition test, and bundle patch when applicable.
- The first deterministic vertical slice is a Host-side model-facing Tool plugin. Other plugin shapes remain guided workflows until their templates have equivalent external-world acceptance.
- Installation and generation do not train or mutate the model. They supply progressively disclosed instructions, references, scripts, and templates.

## Delivery constraint

The audited `@deepseek-ai/dsh-*` runtime package closure is not currently available from the configured npm registry. The supported first delivery route is a local source overlay against the exact Harness checkout in `dsh-reference.lock.json`.

Generated packages remain private and use source-linked development dependencies. Publication mode must stay blocked until every runtime and peer dependency resolves outside the Harness monorepo and a clean packed-artifact smoke passes.

## DSH invariants

- A DSH plugin is a Cordis lifecycle unit composed by Loader/profile patches; it does not create a parallel application launcher.
- Namespace function plugins named-export `name`, `inject`, `Config`, and `apply` as needed and do not add `export default apply`. Service-class plugins may default-export the service class.
- Required topology is declared through `inject`. Optional global lookup uses `ctx.get(name)`; optional scoped composition may use a child `ctx.inject`.
- Every configurable field has a TypeScript contract and runtime Schemastery schema. Defaults belong in the schema; unsupported deployment choices remain required.
- Every registration, listener, timer, worker, request, and external resource has lifecycle-owned cleanup. Disposal stops admission and awaits quiescence.
- Durable Session events are facts. Projections are pure, synchronous, whole JSON values derived from those facts; UI state is not a second authority.
- Tools declare parameter and canonical output schemas, preserve call identity, honor `AbortSignal`, and separate domain outcomes from infrastructure errors.
- Browser extensions use `exports["./client"]`, `dsh.client`, generated Remote contracts where needed, and Slots. React components do not receive Cordis Context or import another feature's runtime component.
- A product-visible change requires a real Loader/profile test in addition to unit and HMR tests. Publication requires a packed-artifact ordinary-Node smoke test.

## Change discipline

- Prefer one verified generator vertical slice over speculative templates for every plugin type.
- Keep reusable DSH facts in the canonical skill references; keep generator mechanics in scripts and output templates.
- Do not encode a local absolute Harness path as a universal default. Resolve it per generated project and record a relocatable fallback plus `DSH_HARNESS_ROOT` override.
- Add an abstraction only for a current provider/consumer, Host/Client, or deterministic-generation boundary.
- Update tests, TODO, installation documentation, and a decision record with the behavior they govern.

## Completion reporting

Report the observable developer experience first, then validation performed, supported scaffold types, remaining TODO, and any version-lock or unpublished-dependency blocker. Never claim DSH compatibility after strict source validation fails, and never claim publication readiness from source-linked tests.
