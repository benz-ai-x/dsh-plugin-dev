# TODO

This is the live execution queue for the reusable `dsh-plugin-dev` Skill, Codex Plugin, and project generator. Stable rules belong in `docs/agent/PROJECT_CONTRACT.md`; completed product choices belong in `docs/decisions/`.

## P0 — Audited DSH knowledge foundation

- [x] Pin the audited DeepSeek Harness version, commit, and docs digest.
- [x] Maintain one canonical DSH workflow with focused Tool, Service, Client, LLM, packaging, and Agent Team references.
- [x] Validate Codex and Claude Code repository discovery against the same canonical body.
- [x] Add deterministic context/source verification.

## P0 — Full-document audit remediation

- [x] Reject the reserved `run_code` Tool name before generation, including
  names derived from the target directory, with a stable error and regression
  tests.
- [x] Match the pinned Harness Node engine and make strict validation reject a
  dirty Harness worktree plus missing or stale linked-package build
  entries.
- [x] Make a generated project's Harness links relocatable through one explicit
  sync command instead of claiming that `DSH_HARNESS_ROOT` rewrites them.
- [x] Generate a thin `CLAUDE.md` project entry so Codex and Claude Code retain
  the same startup contract without duplicating the canonical Skill.
- [x] Exercise built package exports and the actual bundle/profile layer in the
  deterministic acceptance path; keep registry publication claims blocked.
- [x] Correct the Service-class metadata, Session event/surface, Client
  Conversation/Remote build, LLM replay/retry, and Tool presentation guidance.
- [x] Add progressively disclosed routing for filesystem, sandbox/approval,
  persistence/session, subprocess/jobs, and subagent capability work.
- [x] Tighten the Tool template with stable Loader ids, Config default/invalid
  tests, exact parameter-schema tests, and package-map hygiene.

## P1 — Reposition as reusable development tooling

- [x] Confirm the user-visible outcome: install once, start Codex in an unrelated directory, describe a DSH business capability, and receive a verified project scaffold.
- [x] Choose Skill for workflow authoring and a skills-only Codex Plugin for distribution.
- [x] Choose the pinned local Harness source overlay as the first development route because the audited DSH runtime package closure is not published.
- [x] Replace Agent Team Ultra product language across manifests, contracts, architecture, and acceptance documentation.
- [x] Add and validate the Codex Plugin manifest and Skill UI metadata.
- [x] Add a safe dual Codex/Claude Code user-level Skill installer and document both empty-directory workflows.
- [x] Record the product and delivery choice in `docs/decisions/0002-product-scope.md`.

## P2 — Deterministic Tool project vertical slice

- [x] Define the generator CLI contract, normalization rules, collision behavior, and stable error codes.
- [x] Add Tool project templates for package metadata, source, Config schema, bundle patch, tests, project contract, TODO, and DSH lock.
- [x] Generate source-linked development dependencies from the resolved Harness root without treating an absolute path as a universal default.
- [x] Add unit tests for names, unsupported kinds, missing/mismatched Harness source, and non-overwrite behavior.
- [x] Add an empty-directory e2e that installs, typechecks, tests HMR, boots a real Loader composition, builds, and inspects the packed artifact.
- [x] Update the canonical Skill so an agent converts business requirements into a generator specification and then implements the real behavior.

## P3 — Fresh-agent acceptance

- [x] Install the canonical Skill into both Codex and Claude Code user scope without overwriting an unrelated installation or leaving a partial cross-agent setup after a preflight conflict.
- [x] Run a fresh Codex process from an unrelated empty directory and confirm implicit or explicit Skill discovery.
- [x] Verify the agent selects the Tool shape, runs the generator, implements a representative business request, and reports the source-linked publication limitation.
- [ ] Repeat the semantic smoke through the packaged Plugin/local marketplace path.
- [x] Run an authenticated Claude Code semantic smoke from an unrelated empty directory: discover `/dsh-plugin-dev`, generate a Tool baseline, implement real business behavior, and pass strict source, test, build, pack, and isolated profile lifecycle checks.

## P4 — Additional deterministic project kinds

- [ ] Add one-package Service provider/consumer scaffolding with topology and provider-loss tests.
- [ ] Add Host/Client scaffolding with `./client`, `dsh.client`, Remote/projection ownership, Slot UI, reconnect, and disposal tests.
- [ ] Add LLM adapter scaffolding with streaming parser, retry boundary, cancellation, and usage accounting tests.
- [ ] Add Agent Team extension scaffolding only for a selected local/upstream route; never depend on private experimental packages in a publishable mode.
- [ ] Add a library/bundle-only mode where no runtime plugin entry is appropriate.

## P5 — Distribution and baseline evolution

- [ ] Add a local marketplace fixture and packaged Plugin installation/reinstall smoke.
- [ ] Define repository release packaging and a version/cachebuster workflow.
- [x] Recheck npm availability for the complete minimal Tool runtime and peer
  closure, and persist the blocked/ready evidence per baseline channel.
- [ ] Add an independently publishable generator mode only after a clean ordinary-Node dependency closure and packed-artifact profile smoke pass.
- [x] Define schema-v2 stable/edge baseline catalogs, official product-Skill
  snapshots, audited upgrade/promotion gates, and generated-project migration
  guidance.

## Definition of done for the current vertical slice

P1 and P2 are complete when `pnpm verify` passes and a fresh generated Tool project proves strict source lock, typecheck, unit behavior, HMR removal, real Loader configuration, build output, bundle contents, and overwrite refusal from an unrelated empty directory.

Current status: met for the deterministic Tool vertical slice in both Codex and Claude Code. Audited baseline evolution now uses content-addressed stable/edge channels; the current Registry report remains blocked by unpublished DSH alpha packages. P3's packaged-marketplace smoke remains follow-up work, as do the additional project kinds in P4 and independently publishable generation in P5.
