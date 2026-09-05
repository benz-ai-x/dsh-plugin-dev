# dsh-plugin-dev Maintainer Handoff

Updated: 2026-09-05 (Asia/Shanghai)

## Outcome

This repository is the reusable development environment for taking a DeepSeek
Harness plugin from a business requirement through implementation, tests,
packaging, profile integration, and release preparation. It is not a DSH
runtime plugin. Its own implementation is now TypeScript-first while its
installed public commands remain dependency-free `.mjs` artifacts.

The audited default baseline is DeepSeek Harness `0.1.2-rc.1`, official tag
`dsh-v0.1.2-rc.1`, commit
`a66e4702047846cdaa10c66c9d3df3951f5ea70d`. The baseline was scanned from a
clean detached official-tag worktree built with `pnpm@11.7.0`.

Both stable and edge now select rc.1, with ready Tool Registry reports
(24/24 requirements) and same-channel source/archive verification. Alpha.1 is
no longer an active development baseline. Its previous 15 E404s and runtime
regressions are historical, not rc.1 blockers. Earlier worktrees and the
broken alpha.4 recovery backup remain preserved. See current
[acceptance](ACCEPTANCE.md) and [decision 0012](../decisions/0012-rc-1-development-baseline.md).

The local fallback is `../deepseek-harness-baseline-0.1.2-rc.1`. This machine's
`DSH_HARNESS_ROOT` points to `../deepseek-harness`, whose clean checkout is
also detached at rc.1 and rebuilt; its `master` branch remains unchanged.
No global shell configuration or user Harness-home data was migrated.

The normal checkout initially failed its downgrade build because six
alpha.1-only package directories retained ignored outputs. Their `lib` and
`node_modules` contents were preserved outside the workspace in
`../dsh-rc1-artifact-backup.GFZhv2/`; no source files were removed. A forced
Host/Client TypeScript rebuild refreshed unchanged declaration outputs whose
timestamps would otherwise fail the strict gate after manifest changes;
the normal checkout now passes all 387 strict checks with zero warnings.
Existing generated projects still need their environment to match their
recorded static links; changing `DSH_HARNESS_ROOT` alone is not a link sync.

## Read first

1. [`PROJECT_CONTRACT.md`](PROJECT_CONTRACT.md)
2. [`TODO.md`](../../TODO.md)
3. [`dsh-plugin-dev`](../../skills/dsh-plugin-dev/SKILL.md)
4. [`BASELINE_UPGRADE.md`](BASELINE_UPGRADE.md) for an upstream change

Run `pnpm context:check` before planning/editing. Run `pnpm build:check` and
`pnpm typecheck` when changing repository tooling, and
`pnpm context:check:strict` before claiming compatibility with the selected
source baseline.

## TypeScript-first tooling

Authoritative implementation lives in `src/scripts/*.mts` and
`skills/dsh-plugin-dev/src/create-project.mts`, plus the four version-adaptive
companion modules under `skills/version-compatibility-analysis/src/`;
repository tests are `.ts` and run through Vitest. `pnpm build` compiles eight
tooling entries into their
stable `.mjs` paths plus `.d.mts` declarations. The installed Skill therefore
does not need `tsx`, TypeScript, or Vitest at runtime.

The compatibility companion remains read-only by default. Its explicit
`--download-missing --download-dir PATH` mode needs npm and stores only checked
exact-version tarballs outside the project, Harness and Skill. It does not
install packages, execute lifecycle scripts or refresh Registry/baseline
evidence. See the companion's `references/npm-downloads.md` for deferred
ranges/private targets and the partial-result exit code.

`tooling-artifacts.json` binds the compiler and SHA-256 for each
source/runtime/declaration triple. `pnpm build:check` compiles into a temporary
directory and refuses stale or hand-edited output. Do not edit generated
`.mjs` or `.d.mts` files directly. See
[`0006-typescript-first-tooling.md`](../decisions/0006-typescript-first-tooling.md).

## Baseline state

| Item | Stable state |
|---|---|
| Harness | `0.1.2-rc.1` / `dsh-v0.1.2-rc.1` |
| Commit | `a66e4702047846cdaa10c66c9d3df3951f5ea70d` |
| Node | `^22.19.0 || >=24.0.0` |
| Package manager | `pnpm@11.7.0` |
| Workspace packages | 266 |
| Public DSH/vendor packages | 251 |
| Upstream Skills | 17: 11 maintainer, 4 fixture, 2 product |
| Tool Registry closure | `ready`: 24/24 exact requirements available |
| Verification | `passed`, bound to catalog and project digests |

The two official Cordis product Skills are materialized and hash-pinned under
`baselines/{stable,edge}/skills/`. Upstream maintainer Skills remain cataloged
evidence; they are not installed as project-development Skills. The canonical
development workflow remains this repository's `skills/dsh-plugin-dev/`.

## RC.1 changes reviewed

The alpha.4 → rc.1 diff has 280 changed paths, no workspace additions/removals,
no manifest contract changes beyond versions, and no official Skill resource
changes. The runtime changes add declared JSON per-record read compatibility,
version-gated legacy bootstrap, and opt-in invalid derived-record backup/skip.
Projection-cache v5 reads compatible v3/v4 records while preserving lineage
and state-version guards. Its archived-fixture recovery tests and the storage
tests pass: 91 tests across five files. For the exact boundary use
[version-specific contracts](../../skills/dsh-plugin-dev/references/version-contracts.md):
rc.1 retains the earlier Session/Agent/stream/Team implementations, not
alpha.1's handles or format-v2 API. Do not use this baseline change to
downgrade or rewrite existing alpha.1 Session data.

## Alpha.4 changes reviewed (historical)

The stable-to-edge review (2371 files, 297 commits) renamed subagent
continuation messaging — `followup()` is now `sendMessage()` with narrowed
routing (exact live sender, direct parent or direct continuable child only;
running targets steer the nearest step, waiting targets wake and steer, cold
targets resume then steer) — and removed the child-scoped `report` return
channel (`dsh-tool-subagent-report`). `dsh-code-runtime-python` moved into
`packages/experimental/`. Session sequence positions crossing public APIs are
now branded (`SessionSeq`, `SessionLogOffset`, with constructors); the fork
header split `seedLength` into `isSeeded` plus a construction-time
`inheritedEventCount`. The Loader, persistence event vocabulary, projection
change-feed gating, tool registry, surface event set, and both product Skill
bodies are unchanged, and the toolchain contract (Node engine, pnpm) holds.

Contract guidance was updated for these alpha.4 runtime facts:

- Sequence positions are branded numbers at Session/persistence/projection
  boundaries (`core-contracts.md`).
- The completed-turn fork-prefix claim and all other reference assertions were
  re-verified against the alpha.4 tree; no reference cited the renamed or
  removed subagent APIs.

## Alpha.3 changes reviewed

The stable-to-edge review removed `@deepseek-ai/dsh-session-persistence-sqlite`
(the JSONL backend remains the one shipped persistence provider; the abstract
`SessionPersistence` seam now explicitly welcomes out-of-tree backends) and the
`@deepseek-ai/dsh-agent-spine-demo` example, and added
`@deepseek-ai/dsh-session-turn-outline`. Both product Skill bodies are
unchanged and two maintainer Skills changed. `vendor/loader`, the Session
event vocabulary, and the toolchain contract (Node engine, pnpm) are
unchanged.

Contract guidance was updated for these alpha.3 runtime facts:

- The Session projection change feed now gates publication on raw `view`
  identity: listeners fire only when consecutive raw `view` results compare
  unequal by `Object.is`, so an object-valued view must reuse its reference to
  stay silent across internal-only state changes (`core-contracts.md`,
  `client-plugin.md`).
- Conversation targets activate lazily: creating or reading a target source
  does not activate it; first subscription (or the shell's explicit selection)
  does, and unsubscription does not deactivate one.

## Alpha.2 changes reviewed

The stable-to-edge review found four added packages:

- `@deepseek-ai/dsh-client-ui-schedule`
- `@deepseek-ai/dsh-deque`
- `@deepseek-ai/dsh-util-time`
- `@deepseek-ai/dsh-util-values`

The Tool publication closure adds `@deepseek-ai/dsh-session-projection` and
`@deepseek-ai/dsh-util-values`, and removes `@deepseek-ai/dsh-attachment`.
One maintainer Skill was added and three changed; both product Skill bodies are
unchanged.

Contract guidance was updated for these alpha.2 runtime facts:

- Unknown persisted Session events recover only when their stored envelope
  explicitly carries `ignorable: true`; absence is required-on-read. The
  surface remains closed to `user/message`, `assistant/message`, and
  `tool/result`. Declaration merging is not runtime registration, and the
  ordinary log-only `Session.append()` path exposes no ignorable option.
- Typert Remote uses one `RemoteError`, declaration-merged
  `RemoteErrorDetailsMap`, and stable `<domain>/<reason>` codes. Unary methods
  resolve `RemoteResult<T>`; Host/domain and carrier outcomes use the error
  branch, while local assembly faults may reject.
- Direct Remote streams terminate with shared `RemoteError`; reconnect-carrier
  failures remain supervisor-internal. The older unary-only prose in
  `docs/api-gateway.md` is still stale relative to implementation.
- Host readers of `ctx.sessionProjections` declare required injection;
  genuinely optional contributors may scope registration through `ctx.inject`.
- The Tool generator's public `defineTool` shape did not break.

## Generator delivery modes

The deterministic generator still supports one project kind, `tool`, with two
explicit delivery modes.

### Source delivery

`source` is the backward-compatible default. It requires the exact clean built
Harness, generates six `link:` development dependencies, keeps
`private: true`, and retains `context:sync`.

```sh
node skills/dsh-plugin-dev/scripts/create-project.mjs \
  --target /path/to/project \
  --description "Describe the exact model-visible operation." \
  --delivery source \
  --harness-root /path/to/clean-tagged-harness
```

Source verification proves compatibility with that snapshot, not independent
npm publication readiness.

### Registry delivery

`registry` is fail-closed on a digest-valid `ready` Tool closure report. It
needs no Harness path, writes exact ordinary dependency versions,
`dsh-registry.lock.json`, `private: false`, public access, and no
`context:sync`.

```sh
node skills/dsh-plugin-dev/scripts/create-project.mjs \
  --target /path/to/project \
  --description "Describe the exact model-visible operation." \
  --delivery registry
```

The generated normalization executor is never the finished business plugin.
Before release, replace it with the real behavior and use the exact built
archive for clean install/import and profile add/dump/boot/remove.

Decision: [`0005-registry-delivery.md`](../decisions/0005-registry-delivery.md).

## Verification evidence

Historical alpha.4 evidence from 2026-09-02 (superseded for the current checkout
by [ACCEPTANCE.md](ACCEPTANCE.md) and the refreshed channel reports):

- compiled artifact freshness and strict TypeScript typecheck;
- strict context: 272 checks, 0 warnings;
- repository unit tests: 21/21;
- generated-project e2e tests: 2/2;
- source project: sync relocation, install, strict verification, 2 Vitest
  files/9 tests, Loader/HMR, build, public import, archive inspection, profile
  add/dump/remove;
- Registry project: ordinary clean install, strict Registry evidence check,
  build/test/archive, exact `.tgz` install/import in a second clean consumer,
  official CLI profile add/dump/real boot/SIGTERM shutdown/remove/post-remove
  absence;
- edge Registry: 24 available, 0 blocked;
- edge verification and stable promotion/preflight: passed.

The official tag worktree used for local verification is outside this
repository. Another machine should prepare its own clean worktree and set
`DSH_HARNESS_BASELINE_ROOT`; no absolute path is a portable repository default.

## Upstream upgrade procedure

Never edit stable first. Follow [`BASELINE_UPGRADE.md`](BASELINE_UPGRADE.md):

```sh
DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree pnpm upstream:scan
DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree pnpm upstream:update
pnpm upstream:diff
DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree \
  pnpm upstream:check --channel edge
pnpm registry:check --channel edge
DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree pnpm baseline:verify
pnpm baseline:promote
pnpm release:preflight
```

`upstream:update` invalidates edge Registry/verification evidence. Review
package, Skill, API, template, test, and delivery changes before regenerating
those reports. Promotion requires both `registry=ready` and
`verification=passed` for the same catalog/project digests.
Schema-v2 verification also binds the exact Registry digest/status that was
tested. A later ready lookup cannot upgrade a previous source-only pass.

Existing generated projects never follow a new baseline implicitly. Migrate
their channel, delivery mode, lock/evidence, and dependency specifications in
one reviewable change, without altering business behavior silently.

## Remaining work

[`TODO.md`](../../TODO.md) is the live queue. The packaged Plugin/local
marketplace path now has a deterministic install/reinstall/discovery e2e
(`tests/plugin-marketplace.e2e.test.ts`); its real-model semantic leg is gated
behind `DSH_CODEX_SEMANTIC=1` and still needs one recorded pass on a machine
with working Codex backend connectivity. Additional deterministic Service,
Host/Client, LLM, Agent-Team, and library/bundle project kinds remain future
work.

Do not claim those shapes are generator-supported, and do not treat upstream
maintainer Skills as product runtime capabilities.
