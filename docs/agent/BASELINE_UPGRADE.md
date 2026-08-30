# DSH Baseline Upgrade Runbook

This runbook advances the audited DeepSeek Harness contract without allowing a
new upstream tag, a mutable checkout, or incomplete Registry publication to
silently replace the default development baseline.

## Channel contract

- `stable` is the default baseline used by generation and ordinary strict
  verification.
- `edge` is the only channel written by an upstream update. It remains a
  candidate until source, repository, generated-project, Registry, and packed
  install gates are complete.
- Initial migration seeds both channels from the already audited revision. A
  later promotion is permitted only when the edge Registry report is `ready`
  and its full repository verification report is `passed`.
- Generated projects record the channel, exact tag and commit, documentation
  digest, package-manager version, and catalog digest. They never follow a
  moving branch or symlink implicitly.

## Prepare a clean tagged worktree

Keep the normal Harness development checkout and its local changes separate
from baseline evidence. For a new official tag:

```sh
git -C /path/to/deepseek-harness fetch --tags origin
git -C /path/to/deepseek-harness worktree add --detach \
  /path/to/deepseek-harness-baseline-<version> \
  dsh-v<version>
npx --yes pnpm@<version-from-Harness-package.json> install --frozen-lockfile
npx --yes pnpm@<version-from-Harness-package.json> run build:official
```

Run the install and build commands from the new worktree. The scanner refuses
tracked or non-ignored changes and an ignored root `.env`, and it requires the
official `dsh-v<version>` tag to resolve to the worktree's exact `HEAD`.

## Inspect before writing edge

```sh
DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree pnpm upstream:scan
DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree pnpm upstream:update
pnpm upstream:diff
```

`upstream:update` writes only `edge` after schema-v2 migration. It regenerates
the complete workspace package catalog, official Skill catalog, the two pinned
product-Skill snapshots, Tool publication closure, and toolchain contract. It
also resets edge Registry and verification evidence to `unchecked` and
`unverified` so stale evidence cannot survive a source update.

Review the diff for package additions/removals, manifest contracts, exports,
runtime and peer edges, toolchain changes, official Skill changes, and Tool
closure changes. Treat every pre-release change as potentially breaking. Update
the canonical Skill references, generator templates, tests, migration notes,
and compatibility documentation before verification.

## Verify candidate source and behavior

```sh
DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree \
  pnpm upstream:check -- --channel edge

DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree \
  pnpm baseline:verify
```

`baseline:verify` re-scans the clean tagged source, verifies the product-Skill
snapshots, then runs this repository's full `pnpm verify` under the exact pnpm
version recorded by Harness. The generated Tool e2e includes strict source,
unit/HMR, Loader, build, archive inspection, and isolated profile
add/dump/remove coverage.

The deterministic acceptance matrix currently covers only Tool projects.
Service, Host/Client, LLM, Agent Team, and library/bundle-only kinds cannot be
claimed as generator-compatible until their P4 templates and external-world
tests exist.

## Check Registry closure

```sh
pnpm registry:check -- --channel edge
```

The check queries every exact first-party package in the Tool publication
closure and every external dependency/optional/peer range. Private,
experimental, workspace-only, or unavailable requirements block the report.
The command exits non-zero while blocked but still writes an auditable report.

Source-linked verification and a `blocked` Registry report are a valid edge
result. They are not publication evidence and must not replace stable.

## Promote or retain edge

```sh
pnpm baseline:promote
pnpm release:preflight
```

Promotion copies edge catalog, Registry report, verification evidence, and
product-Skill snapshots to stable only when Registry is `ready` and repository
verification is `passed`. `release:preflight` repeats those immutable report
and digest checks for the default stable channel.

After promotion, bump and release `dsh-plugin-dev`, record the compatibility
mapping, and migrate existing generated projects explicitly. Regenerate their
lock and link specifications in a reviewable change; do not silently edit
their business implementation. Retain the prior project release and stable
lock in Git for rollback.

The committed lock stores only a relocatable fallback. Another machine should
set `DSH_HARNESS_BASELINE_ROOT` or prepare the equivalent sibling worktree.
