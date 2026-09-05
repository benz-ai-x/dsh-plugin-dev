# DSH Plugin Dev Architecture

## Authoring and use flow

```text
This repository
  |
  +-- .codex-plugin/plugin.json -------- distributable Codex Plugin
  |
  +-- canonical dsh-plugin-dev skill
        |-- focused DSH references
        |-- deterministic generator
        `-- scaffold assets
                 |
Codex or Claude Code user-level skill link, or installed Plugin
                 |
either code agent started in an unrelated directory
                 |
business requirement -> classified DSH shape
                 |
generated project -> audited source or Registry closure -> Loader/profile verification
```

The authoring repository and each generated DSH project have different responsibilities. This repository owns reusable knowledge, generator behavior, installation, and forward tests. A generated project owns its business contract, runtime implementation, configuration, tests, profile layer, and delivery decisions.

## Discovery and distribution

`skills/dsh-plugin-dev/` is the canonical skill body. The repository-local `.agents/skills/dsh-plugin-dev/SKILL.md` and `.claude/skills/dsh-plugin-dev/SKILL.md` adapters delegate to it while developing this repository. `scripts/install-user-skill.mjs` preflights and links the canonical directory into both `$HOME/.agents/skills` and `$HOME/.claude/skills`, making it available to Codex and Claude Code in unrelated working directories without copying or drifting the instructions.

`skills/version-compatibility-analysis/` is the project-level companion, with
its own thin `.agents/skills/` and `.claude/skills/` adapters. It is included in
the Plugin's `skills/` distribution, but the personal installer deliberately
continues to install only the development skill. No personal companion copy is
needed to analyze this project.

`.codex-plugin/plugin.json` packages the canonical skill for Codex Plugin distribution. The plugin manifest points directly at `skills/`, so Codex repository, user-level, and packaged discovery consume one body. Claude Code consumes that same body through its repository adapter or personal Skill link; its explicit invocation syntax is `/dsh-plugin-dev`.

## Information layers

1. `AGENTS.md` and `CLAUDE.md` solve repository discovery only.
2. `PROJECT_CONTRACT.md` contains always-relevant product and DSH invariants.
3. `SKILL.md` selects development versus generation and routes by plugin type.
4. References contain substantial mode-specific contracts and upstream evidence.
5. Generator scripts enforce deterministic naming, collision, source-lock, and Registry-evidence behavior.
6. Assets are output templates; agents do not load them as general instructions.
7. `TODO.md` carries mutable implementation state, while decision records own durable choices.
8. The schema-v2 reference lock, channel catalogs, and validator tie guidance
   and generated output to content-addressed stable or edge DSH snapshots.

## TypeScript authoring and distribution boundary

The authoritative tooling implementation is strict TypeScript:
`src/scripts/*.mts` owns baseline management, installation, and context
validation, while `skills/dsh-plugin-dev/src/create-project.mts` owns the
generator. Repository tests and build orchestration are TypeScript and run
through Vitest/tsx.

The companion's `src/*.mts` owns read-only Git comparison, workspace discovery,
and declared dependency traversal. Its dependency-free `scripts/*.mjs` are
compiled and digest-checked by the same build pipeline.

The existing `.mjs` command paths remain the distribution ABI. `pnpm build`
compiles `.mts` into those paths plus `.d.mts` declarations, without adding a
runtime dependency to an installed Skill. `tooling-artifacts.json` records the
compiler and SHA-256 of every source/runtime/declaration triple;
`pnpm build:check` compiles into a temporary directory and compares bytes and
the manifest without rewriting tracked artifacts. Generated-project context,
build, and pack verifiers intentionally remain dependency-free `.mjs`
templates because they must run before a generated project installs packages.

## Generation boundary

Natural-language interpretation remains with the agent. The agent turns the business request into a small project specification: package name, plugin name, DSH kind, model-facing tool name, product description, baseline channel, and delivery mode. The generator validates that specification and creates a collision-free baseline. The agent then replaces baseline behavior with the requested domain implementation and proves it through the generated test ladder.

The first generator implements the `tool` kind. Unsupported kinds fail explicitly rather than emitting a misleading generic package. Their reference-guided workflows remain available while equivalent deterministic templates are developed.

## Source and Registry delivery

Generated projects use semver peer contracts for their eventual runtime package shape, but their development dependencies link to the audited local Harness checkout. Static `link:` specs point at each directly consumed package's declared build output, so strict validation covers two distinct planes: clean tracked/non-ignored inputs at the pinned commit with no ignored root `.env` for the source CLI to load, and present, timestamp-fresh `main`/`types` entries. Ignored dependency/build output remains allowed. This includes the source-launched CLI used by profile acceptance as well as package/build inputs. It gives typecheck, real Cordis services, Loader tests, lifecycle tests, and built public-import smokes access to the audited baseline whether or not those runtime packages are available from the Registry.

The timestamp check detects absent and visibly older artifacts; it is not a content digest. If the Harness checkout moves, generated projects run `context:sync` with the selected new root so package links, the fallback lock, and the package-manager lock move together. An environment override by itself cannot rewrite an already generated manifest.

Source-linked success is not publication evidence, even when the selected
baseline's packages are available from the Registry. Registry delivery is a
separate generated contract enabled only by a `ready` closure report. It uses
exact ordinary versions, retains the report as `dsh-registry.lock.json`, and
contains no local-resolution path or sync command. Its acceptance installs the
generated project, installs the exact `.tgz` into a second clean consumer,
imports its public entry, and exercises profile add/dump/boot/remove through
the pinned official CLI. Registry evidence is time-bound; a release still uses
the exact verified archive and repeats project-specific checks.

## Updating the upstream baseline

Before updating a channel, `pnpm compatibility:analyze --harness-root PATH`
compares the current lock commit directly with the candidate's committed
objects. It reads workspace definitions independently at both revisions and
obtains dependency roots from the selected catalog or explicit inputs. This
diagnostic path does not require a live old worktree, a candidate build, or
Registry readiness. It cannot promote a channel or establish runtime
compatibility. Unknown future metadata is compared; unsupported workspace or
dependency syntax is reported for agent-led inspection rather than hidden by
old hardcoded paths. Each invocation refreshes evidence, not the skill code.

An explicit opt-in download boundary consumes that same candidate graph and
retrieves exact published tarballs using npm with scripts disabled. It writes
only to separate owned storage, rechecks identity/integrity on cache reuse,
and returns download/deferred evidence without altering the declarative graph
or any audited Registry status. It is not an installation solver or updater.

Changing `dsh-reference.lock.json` is an audit task. The updater scans a clean
official tagged worktree into edge, including the complete workspace package
and DSH/vendor release-family catalogs, all upstream Skills, two materialized
product-Skill snapshots, and the Tool publication closure. Stable-to-edge diff
drives revisions to affected references and templates. Full strict/generator
verification and exact Registry closure are bound to the catalog digest; only
passed evidence may promote edge to stable. The operational sequence lives in
`BASELINE_UPGRADE.md`.
