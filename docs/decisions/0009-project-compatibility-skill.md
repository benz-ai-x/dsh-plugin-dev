# 0009 — Project-level, version-adaptive compatibility analysis

Date: 2026-09-05

## Decision

Extend the product with the canonical project-level
`skills/version-compatibility-analysis/` companion. This supersedes the
single-skill scope in decision 0002; the development skill and generator retain
their existing personal-install workflow. The companion has thin Codex and
Claude Code project adapters and ships with the skills-only Codex Plugin.
It is not automatically installed into personal skill directories.

Migrate the personal analysis workflow into this companion and maintain its
helpers as strict TypeScript with dependency-free generated Node entries.
Expose `pnpm compatibility:analyze` as read-only evidence collection.

## Self-upgrade semantics

Refresh analysis inputs on each invocation: the selected lock commit, candidate
Git revision, workspace definitions, all manifest fields, declaration graph,
skill resources, and the source/test/documentation contracts relevant to the
downstream. Do not encode release versions, workspace directories or Tool
dependency names in the analyzer. Dependency roots are selected from a
digest-checked catalog or explicit/project inputs.

The agent supplies semantic review and evidence-based repair recommendations;
the helper is not an installation solver or a proof of API compatibility.
Unsupported future schemas/protocols stay visible and can be investigated with
explicit refs/roots and read-only source inspection without patching tooling.
No promise is made that one parser can automatically understand all future
formats. New versions do not require a code change merely to begin analysis.

“Self-upgrade” does not mean self-modifying instructions, executing upstream
skills, silently following remote HEAD, writing audit evidence, or promoting
stable. Analysis is separate from the existing authorized upgrade runbook.

## Validation boundary

Fixture tests and relocated/packed executable checks validate the companion
independently of Harness installation. Actual candidate comparison uses
committed objects, so a missing old worktree need not prevent analysis when
both commits remain present in the candidate repository. Missing objects and
unsupported inputs are reported explicitly. Runtime, migration, Registry and
archive/profile compatibility still require their own evidence.
