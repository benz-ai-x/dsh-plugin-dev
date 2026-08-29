---
name: dsh-plugin-dev
description: Create, scaffold, develop, debug, test, package, or review DeepSeek Harness (dsh) Cordis plugin projects from business requirements, including tools, services, Client UI, LLM adapters, lifecycle/HMR, profiles, and Agent Team extensions. Excludes unrelated TypeScript and Codex plugin authoring itself.
---

# DSH Plugin Development

Turn a product requirement into a DSH extension that works through the real
Cordis Loader, survives replacement and disposal, and remains usable from the
profile or package form the project actually ships.

## Start

1. Identify the requested product outcome and whether this is a new project or
   an existing DSH project.
2. Locate the project root and read `docs/agent/PROJECT_CONTRACT.md`, `TODO.md`,
   and `dsh-reference.lock.json` completely when they exist.
3. Run `pnpm context:check` when the project provides it. In a freshly
   generated project whose dependencies are not installed yet, run the
   dependency-free checker directly with
   `node scripts/verify-dsh-context.mjs`; add `--require-source` for the strict
   gate. For behavior tied to an audited Harness snapshot, pass the strict gate
   before editing.
4. Inspect the current directory or worktree and existing package shape.
   Preserve unrelated changes and never overwrite project files implicitly.
5. Classify the plugin work before loading detailed references.

Stop and report the mismatch if strict source validation fails. Do not silently
apply this skill's pinned contracts to a different DSH revision.

## Route the task

Read [core contracts](references/core-contracts.md) for every DSH task, then
load only the applicable references:

- New or empty project, business-requirement classification, or scaffold
  generation: read [new project scaffolding](references/scaffolding.md), then
  the reference for the selected DSH kind.
- Tool definition, model-facing schema, execution, policy, or presentation:
  read [tool plugins](references/tool-plugin.md).
- Capability seam, Service Definition, provider, consumer, or runtime registry:
  read [service plugins](references/service-plugin.md).
- Web UI, Remote API, projection, Client module, renderer, or Slot:
  read [client plugins](references/client-plugin.md).
- Model provider, streaming parser, routing, retry, or usage accounting:
  read [LLM adapters](references/llm-adapter.md).
- Filesystem, subprocess, background job, sandbox, approval, durable Session,
  persistence, or subagent authority/lifecycle work: read
  [runtime capabilities](references/runtime-capabilities.md), then the
  subsystem-specific upstream documents it selects.
- Package creation, bundle patch, profile install, HMR, tests, or publication:
  read [packaging and testing](references/packaging-testing.md).
- Agent Team, teammate, mailbox, shared task, or Team UI behavior:
  read [Agent Team extensions](references/agent-team.md) plus every other
  reference required by the actual surface.

Do not read every reference preemptively.

## Create a project from a business requirement

For a new project, keep natural-language interpretation with the agent and use
the deterministic generator only to materialize a validated baseline. Record
the outcome, DSH kind, public names, service topology, authority, persistence,
cancellation, disposal, configuration, delivery route, and one external-world
assertion before generation.

The current generator supports the `tool` kind. Run
`scripts/create-project.mjs` relative to this skill as documented in
[new project scaffolding](references/scaffolding.md). It validates the pinned
Harness source and refuses non-empty targets and output collisions.

After generation, continue the task: replace the baseline executor and tests
with the requested business behavior, run the generated verification ladder,
and update its TODO. A compiling normalization example is not completion of a
user's product request. Do not force an unsupported Service, Client, LLM, or
Agent Team requirement into the Tool template; build that shape deliberately
from its routed contracts until a deterministic template exists.

## Establish the contract before implementation

Record or confirm:

- the user-visible or model-visible outcome;
- the plugin form and exact service dependencies;
- configuration fields and runtime validation;
- authority-bearing inputs and stable failure codes;
- the authoritative state and commit point;
- cancellation ownership and disposal settlement;
- package/profile delivery path;
- one external-world acceptance assertion.

Keep a capability in one package until a real provider/consumer or Host/Client
boundary requires separation. If a Definition, Provider, and Consumer must
evolve independently, give each its own package and dependency direction.

## Implement one vertical slice

1. Add or update the narrow public contract and its runtime schema.
2. Add a failing test at the lowest useful layer.
3. Implement the lifecycle-owned behavior.
4. Exercise it through its real registry or service.
5. Add a real Loader/profile test for product-visible behavior.
6. Prove removal or replacement by disposing the contributing Fiber.
7. Add packed-artifact verification when package resolution or publication is
   part of the change.

Prefer durable facts and derived views over mutable duplicate stores. Publish
notifications only after the authoritative operation commits.

## DSH-wide constraints

- Namespace function plugins use named exports and no default export. A default
  export is appropriate for a Service class, not for `export function apply`
  beside namespace metadata.
- Declare required services with `inject`; do not encode activation order in
  YAML row order. Use `ctx.get()` for optional global lookup.
- Pair each TypeScript `Config` with a same-named Standard Schema. Put defaults
  in the schema and reject invalid deployment values during load.
- Make every registration and external resource reversible. Disposal closes
  admission, cancels owned work, and awaits quiescence.
- Preserve immutable request, result, event, and snapshot values at public
  boundaries.
- Carry caller cancellation through all parsing, transport, subprocess, and
  provider layers until ownership explicitly transfers.
- Treat persistent Session events as facts and projections as pure derived
  values. Do not make UI-local state authoritative.
- Test what the model, user, durable log, filesystem, network boundary, or
  profile observes—not only an internal callback or coverage percentage.

## Compose and verify

Use stable Loader row ids. Remember that a later patch replaces a row's whole
`config`, rather than deep-merging it. Inspect the effective tree with
`dsh --profile <name> --dump-config` before booting.

For publishable external work, verify every dependency is actually published
and not marked private. A source checkout or successful TypeScript path alias
does not prove an installable package closure.

Run the repository's documented verification command. If no unified command
exists, cover typecheck, unit, HMR, real Loader, real profile, cancellation,
replay where applicable, and packed-artifact smoke separately.

## Close the task

Update `TODO.md` as work advances and add a decision record when a package,
authority, persistence, or delivery choice becomes durable. Report the
observable result, tests run, remaining work, source-linked versus publishable
delivery status, and any baseline mismatch.
