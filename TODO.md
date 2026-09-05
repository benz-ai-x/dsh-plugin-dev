# TODO

This is the live execution queue for the reusable `dsh-plugin-dev` Skill, Codex Plugin, and project generator. Stable rules belong in `docs/agent/PROJECT_CONTRACT.md`; completed product choices belong in `docs/decisions/`.

## Current execution — DSH 0.1.2-rc.1 development baseline (2026-09-05)

- [x] Confirm the official `dsh-v0.1.2-rc.1` tag and inspect the existing
  worktrees, environment overrides and source-lock gates without disturbing
  the pending compatibility-download changes.
- [x] Prepare and build a clean detached rc.1 worktree; review the exact
  alpha.4-to-rc.1 source and dependency changes.
- [x] Replace the edge candidate through the audited update command, check
  its complete Registry closure and verify source plus packed Tool delivery.
- [x] Update current documentation and Skill version routing, retaining
  alpha.1 findings only as historical evidence.
- [x] Promote the verified rc.1 candidate to stable; align the clean local
  Harness checkout used by `DSH_HARNESS_ROOT` without rewriting its branches.
- [x] Refresh both channels' final verification and preflight, confirming
  default analysis and generated projects select rc.1 rather than alpha.1.

Closure: both channels pin `a66e4702047846cdaa10c66c9d3df3951f5ea70d`.
The normal source checkout is detached at the same tag; its `master` tip and
all earlier worktrees are retained. Six orphan alpha.1 build/dependency
directories are backed up outside the workspace. Forced TypeScript and
official builds plus the local strict gate pass. Default analysis reports
rc.1 → rc.1 with no differences; source and Registry scaffolds select stable
rc.1. Final `baselines/*/verification.json` reports and preflight bind the
closing project state; no user Sessions or existing generated projects were
migrated. The real-model marketplace leg remains explicitly skipped.

## Historical execution — DSH 0.1.3-alpha.1 compatibility (2026-09-05)

Follow-up — opt-in npm downloads for compatibility analysis:

- [x] Derive exact download targets from each candidate's actual dependency
  graph, with explicit gaps for private packages and unresolved ranges.
- [x] Add an explicit download mode with isolated, reusable tarball storage,
  integrity checks, bounded failures and disabled lifecycle scripts; preserve
  the default read-only analysis and all project/baseline inputs.
- [x] Cover downloads, cache reuse, unavailable versions, integrity failures,
  output safety and relocated/packed execution with regression tests.
- [x] Update the canonical Skill, usage documentation and decision record;
  build and validate the shipped tooling without treating downloads as
  Registry delivery or candidate runtime acceptance.

Download acceptance: 13 companion regressions pass. A public npm smoke at
2026-09-05 00:28 UTC downloaded and checked five candidate vendor tarballs;
15 alpha.1 versions remained E404 and four external ranges were deferred.
A second selected-package run reused its verified cache. No dependencies were
installed, no Registry report was written by the downloader, and no channel
was promoted. Verification bindings are refreshed separately for the tooling
changes, against the existing unchanged Registry reports.

- [x] Create `codex/dsh-0.1.3-compatibility`, preserving the project companion
  migration already in the worktree.
- [x] Preserve the broken alpha.4 worktree, restore a clean tagged stable
  source, and pass strict validation without changing the stable revision.
- [x] Prepare a clean tagged alpha.1 candidate and update edge through the
  baseline runbook; review workspace, API and dependency changes.
- [x] Route version-specific guidance for persistence handles, format-v2
  migration, assistant streams, Client transients, Team messages, attachments,
  proxy transport and native installation without changing alpha.4 semantics.
- [x] Add regression coverage for the discovered compatibility boundaries;
  verify both channels' generated Tool Loader/profile and archive behavior.
- [x] Exercise candidate persistence migration/cold recovery and record the
  historical-load performance limitation separately from correctness.
- [x] Fix cross-channel Registry test fallback and require verification to
  bind the same Registry report before promotion; cover stale/source-only
  evidence with regression tests.
- [x] Refresh both channels' digest-bound verification and Registry evidence.
  Keep alpha.1 in edge if its Registry closure is blocked; do not promote it.

Delivery handoff: commit/push the verified branch, open a PR, and send the
completion summary/PR link through Feishu CLI. Recipient and bot identity were
confirmed by the user; GitHub and Feishu receipts belong in the task handoff,
not in the digest-bound runtime evidence.

Historical external gates: that public Registry report recorded E404 for
15 exact alpha.1 Tool-closure packages, so alpha.1 remained source-only and
was not promoted. It has since been replaced by the user-selected rc.1
baseline. Alpha.1 historical-load performance acceptance was not cleared;
the real-model marketplace smoke remains pending for the current project.

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

## P0 — TypeScript-first tooling

- [x] Move generator, baseline, context, and installer implementation into
  strict TypeScript sources while preserving the public `.mjs` entry paths.
- [x] Compile declarations and dependency-free runtime artifacts with a
  source/output digest manifest and a non-mutating freshness check.
- [x] Migrate repository unit and e2e suites to TypeScript and Vitest.
- [x] Keep generated-project pre-install verifiers as dependency-free `.mjs`
  templates while generated plugin runtime and tests remain TypeScript.

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
- [ ] Repeat the semantic smoke through the packaged Plugin/local marketplace path. The deterministic marketplace lifecycle (fixture, install, reinstall, discovery, remove) is covered by `tests/plugin-marketplace.e2e.test.ts`; the real-model semantic leg is gated behind `DSH_CODEX_SEMANTIC=1` and awaits a working Codex backend connection on the recording machine.
- [x] Run an authenticated Claude Code semantic smoke from an unrelated empty directory: discover `/dsh-plugin-dev`, generate a Tool baseline, implement real business behavior, and pass strict source, test, build, pack, and isolated profile lifecycle checks.

## P4 — Additional deterministic project kinds

- [ ] Add one-package Service provider/consumer scaffolding with topology and provider-loss tests.
- [ ] Add Host/Client scaffolding with `./client`, `dsh.client`, Remote/projection ownership, Slot UI, reconnect, and disposal tests.
- [ ] Add LLM adapter scaffolding with streaming parser, retry boundary, cancellation, and usage accounting tests.
- [ ] Add Agent Team extension scaffolding only for a selected local/upstream route; never depend on private experimental packages in a publishable mode.
- [ ] Add a library/bundle-only mode where no runtime plugin entry is appropriate.

## P5 — Distribution and baseline evolution

- [x] Migrate `version-compatibility-analysis` into the project as a canonical
  companion with Codex/Claude Code adapters and Plugin/archive distribution;
  keep the existing personal installer scoped to the development skill.
- [x] Add read-only, version-adaptive analysis: derive the baseline and delivery
  roots from current lock/catalog data, rediscover candidate workspaces and
  dependency edges, and compare arbitrary Git revisions without changing code
  or promoting channels first.
- [x] Verify fixture upgrades, read-only behavior and relocated/packed companion
  execution; record actual-candidate evidence separately from pinned-runtime
  validation. The broken alpha.4 worktree was preserved and rebuilt at its
  original locked tag; strict validation now passes for both channels.

- [x] Add a local marketplace fixture and packaged Plugin installation/reinstall smoke.
- [ ] Define repository release packaging and a version/cachebuster workflow.
- [x] Recheck npm availability for the complete minimal Tool runtime and peer
  closure, and persist the blocked/ready evidence per baseline channel.
- [x] Add an independently publishable generator mode only after a clean ordinary-Node dependency closure and packed-artifact profile smoke pass.
- [x] Upgrade the audited baseline to DSH `0.1.2-alpha.2`, review package/Skill/API changes, and prove source plus Registry delivery against the official tagged worktree.
- [x] Upgrade the audited baseline to DSH `0.1.2-alpha.3`: review the
  SQLite-persistence and example-package removals plus the
  `session-turn-outline` addition, document the projection view-identity
  change-feed gate, and re-prove source plus Registry delivery against the
  official tagged worktree.
- [x] Upgrade the audited baseline to DSH `0.1.2-alpha.4`: review the branded
  `SessionSeq`/`SessionLogOffset` boundary types, the `seedLength` →
  `isSeeded`/`inheritedEventCount` fork-header split, the subagent
  `followup()` → `sendMessage()` rename with its narrowed routing, the
  `tool-subagent-report` removal, and the `code-runtime-python` move to
  experimental; document the branded-sequence boundary in core-contracts and
  re-prove source plus Registry delivery against the official tagged worktree.
- [x] Define schema-v2 stable/edge baseline catalogs, official product-Skill
  snapshots, audited upgrade/promotion gates, and generated-project migration
  guidance.
- [x] Select `dsh-v0.1.2-rc.1` for local development through edge verification
  and stable promotion, replacing the alpha.1 candidate; audit its
  storage/projection-cache delta and prove the ready rc.1 Tool closure.

## Definition of done for the current vertical slice

P1 and P2 are complete when `pnpm verify` passes and a fresh generated Tool project proves strict source lock, typecheck, unit behavior, HMR removal, real Loader configuration, build output, bundle contents, and overwrite refusal from an unrelated empty directory.

Recorded deterministic Tool acceptance was met in both Codex and Claude Code.
Audited baseline evolution uses content-addressed stable/edge channels; the
audited baseline is `0.1.2-rc.1` for both channels. Historical Registry acceptance does
not establish the current checkout or a newer candidate's compatibility.
P3's marketplace semantic leg (real-model, `DSH_CODEX_SEMANTIC=1`) remains gated
on backend connectivity, as do the additional project kinds in P4.

Current evidence (2026-09-05): both channel verification ladders pass with
36 unit tests passed / 1 conditional skip, and 3 e2e tests passed / 2 skips.
Both rc.1 channels cover source plus ordinary Registry archive/profile
delivery, with 24/24 Registry requirements available. The marketplace
real-model leg is skipped on both. Thirteen companion regressions include
packed execution, version-independent discovery and opt-in npm downloads;
build/typecheck/Skill validation pass. The rc.1 upstream storage and
projection-cache regressions passed 91 tests across five files. The older
826-test alpha.1 run is historical only. These do not certify performance,
other operating systems, user-data downgrade or unsupported P4 generators.
See `docs/agent/ACCEPTANCE.md` for scope and reproduction.
