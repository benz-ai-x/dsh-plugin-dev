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
generated project -> pinned Harness source -> Loader/profile verification
```

The authoring repository and each generated DSH project have different responsibilities. This repository owns reusable knowledge, generator behavior, installation, and forward tests. A generated project owns its business contract, runtime implementation, configuration, tests, profile layer, and delivery decisions.

## Discovery and distribution

`skills/dsh-plugin-dev/` is the canonical skill body. The repository-local `.agents/skills/dsh-plugin-dev/SKILL.md` and `.claude/skills/dsh-plugin-dev/SKILL.md` adapters delegate to it while developing this repository. `scripts/install-user-skill.mjs` preflights and links the canonical directory into both `$HOME/.agents/skills` and `$HOME/.claude/skills`, making it available to Codex and Claude Code in unrelated working directories without copying or drifting the instructions.

`.codex-plugin/plugin.json` packages the canonical skill for Codex Plugin distribution. The plugin manifest points directly at `skills/`, so Codex repository, user-level, and packaged discovery consume one body. Claude Code consumes that same body through its repository adapter or personal Skill link; its explicit invocation syntax is `/dsh-plugin-dev`.

## Information layers

1. `AGENTS.md` and `CLAUDE.md` solve repository discovery only.
2. `PROJECT_CONTRACT.md` contains always-relevant product and DSH invariants.
3. `SKILL.md` selects development versus generation and routes by plugin type.
4. References contain substantial mode-specific contracts and upstream evidence.
5. Generator scripts enforce deterministic naming, collision, and source-lock behavior.
6. Assets are output templates; agents do not load them as general instructions.
7. `TODO.md` carries mutable implementation state, while decision records own durable choices.
8. The reference lock and validator tie guidance and generated output to an audited DSH source snapshot.

## Generation boundary

Natural-language interpretation remains with the agent. The agent turns the business request into a small project specification: package name, plugin name, DSH kind, model-facing tool name, product description, and Harness source. The generator validates that specification and creates a collision-free baseline. The agent then replaces baseline behavior with the requested domain implementation and proves it through the generated test ladder.

The first generator implements the `tool` kind. Unsupported kinds fail explicitly rather than emitting a misleading generic package. Their reference-guided workflows remain available while equivalent deterministic templates are developed.

## Source-linked development

Generated projects use semver peer contracts for their eventual runtime package shape, but their development dependencies link to the audited local Harness checkout. This gives typecheck, real Cordis services, Loader tests, and lifecycle tests access to the exact source baseline even while the DSH runtime packages are unpublished.

Source-linked success is not publication evidence. A later registry delivery mode must replace those links with ordinary installable versions and pass a clean packed-artifact smoke outside the monorepo.

## Updating the upstream baseline

Changing `dsh-reference.lock.json` is an audit task. The updater inspects relevant upstream documentation, Loader behavior, canonical packages, public package availability, and test policy; revises affected references and templates; then runs strict context validation, generator e2e, and fresh-agent discovery smokes.
