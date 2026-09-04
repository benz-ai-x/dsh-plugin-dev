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

For impact analysis before authorizing this mutating workflow, invoke the
project's `version-compatibility-analysis` skill or run
`pnpm compatibility:analyze --harness-root /path/to/deepseek-harness`.
It reads the current lock and candidate Git objects without writing edge or
requiring the old baseline worktree. Its evidence does not satisfy the
promotion gates below.

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
  pnpm upstream:check --channel edge

pnpm registry:check --channel edge

DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree \
  pnpm baseline:verify
```

`baseline:verify` re-scans the clean tagged source, verifies the product-Skill
snapshots, then runs this repository's full `pnpm verify` under the exact pnpm
version recorded by Harness. The generated Tool e2e includes strict source,
unit/HMR, Loader, build, archive inspection, and isolated profile
add/dump/boot/remove coverage. When the Registry report is ready, it also
generates an ordinary-dependency project, installs its exact archive into a
clean consumer, and exercises the same profile lifecycle without source links.
When that channel's Registry is blocked, the archive-install leg is explicitly
skipped and a negative test proves Registry generation is refused. It never
falls back to another channel's packages or mixes them with the selected CLI.

Verification schema v2 binds the exact Registry report digest and status used
by the tests, in addition to the catalog and project digests. Check Registry
before verification (a blocked query exits 2 but permits source-only work).
After any Registry recheck, rerun verification before promotion, even if the
new report is ready. Historical v1 and source-only reports cannot authorize
publication. Input changes during verification fail closed.

The deterministic acceptance matrix currently covers only Tool projects.
Service, Host/Client, LLM, Agent Team, and library/bundle-only kinds cannot be
claimed as generator-compatible until their P4 templates and external-world
tests exist.

## Check Registry closure

```sh
pnpm registry:check --channel edge
```

The check queries every exact first-party package in the Tool publication
closure and every external dependency/optional/peer range. Private,
experimental, workspace-only, or unavailable requirements block the report.
The command exits non-zero while blocked but still writes an auditable report.

Source-linked verification and a `blocked` Registry report are a valid edge
result. They are not publication evidence and must not replace stable.

To refresh stable evidence without changing its baseline, use
`pnpm registry:check --channel stable`, then
`node scripts/baseline.mjs verify --channel stable` with stable's clean source.

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
lock and source-link or Registry specifications in a reviewable change; do not
silently edit their delivery mode or business implementation. Retain the prior
project release and stable lock in Git for rollback.

The committed lock stores only a relocatable fallback. Another machine should
set `DSH_HARNESS_BASELINE_ROOT` or prepare the equivalent sibling worktree.

## Recover invalid local worktree metadata

If the source directory exists but Git reports a missing worktree
administration directory, do not replace the lock with the main checkout's
HEAD. Preserve the entire broken directory outside the fallback path, create
a new detached worktree at the locked tag, install/build there, then pass
strict validation. Keep the preserved directory until its local changes have
been reviewed; reconstruction of Git metadata is not proof those files were
clean. This repairs local resolution without changing either channel's API.
