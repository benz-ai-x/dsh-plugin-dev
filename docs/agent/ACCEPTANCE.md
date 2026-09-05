# Acceptance

## Repository acceptance

- `.codex-plugin/plugin.json` validates as a skills-only Codex Plugin and points at the canonical skill directory.
- Codex repository discovery, Codex Plugin discovery, and the Claude Code adapter reach one canonical `SKILL.md` body.
- Every routed reference exists, and scaffolding instructions select only the references required by the requested DSH shape.
- The pinned repository Harness checkout resolves through `DSH_HARNESS_BASELINE_ROOT` or the recorded fallback; version, commit, docs digest, and Node engine match the lock; tracked/non-ignored inputs are clean; the ignored root `.env` loaded by the source CLI is absent; and every directly linked package has present, fresh declared build entries. Generated projects separately use `DSH_HARNESS_ROOT`. Ignored dependency/build output is allowed.
- The user-skill installer preflights and creates both Codex and Claude Code personal links, is idempotent for the same source, supports either agent independently, and refuses partial installation when either target conflicts.
- Unit tests cover generator validation, reserved `run_code` rejection,
  collision refusal, deterministic output, source and Registry delivery,
  dual-Agent templates, and unsupported plugin kinds/delivery modes.
- Generator, baseline, context, installer, and repository tests typecheck under
  the strict TypeScript configuration. Every distributed `.mjs` entry and
  `.d.mts` declaration byte-matches a fresh compile, and its source/output
  SHA-256 matches `tooling-artifacts.json`.

Run:

```sh
pnpm build:check
pnpm typecheck
pnpm context:check
pnpm context:check:strict
pnpm test
pnpm test:e2e
pnpm verify
```

## Version-adaptive companion acceptance

- Both project adapters reach `skills/version-compatibility-analysis/SKILL.md`;
  the same canonical resources and executable helpers are shipped in archives.
- `pnpm test:compatibility` exercises new arbitrary versions, package moves,
  workspace changes/exclusions, dependency/peer/optional edges, skill-resource
  drift, invalid inputs, missing revisions, relocated distribution, and opt-in
  exact npm downloads with cache reuse, integrity and side-effect boundaries.
- Committed-object analysis leaves lock files, Git HEAD/index and worktree
  state unchanged and works without the old baseline worktree or a build of
  the candidate. It reads no historical Registry status as current readiness.
- Unknown schemas/protocols produce explicit gaps or actionable errors, never
  an automatic compatibility verdict; explicit refs/roots and Agent inspection
  remain available without version-specific edits.
- Passing these checks proves the analysis tool, not the candidate runtime or
  the current health of the pinned Harness checkout.

Recorded 2026-09-05: thirteen companion tests pass, including arbitrary successive
version/layout fixtures, no-write assertions, explicit downloads through a
real local npm Registry, and execution from an actual tarball. Default analysis
does not query npm or create a download directory. The isolated marketplace
test also installs and runs the companion;
the real-model semantic leg was not run. Historical committed-object analysis found
266 → 272 workspace packages between the locked alpha.4 and local alpha.1 of
the next minor release, with an unchanged 20-node Tool declaration graph.
This analysis alone is not runtime or Registry evidence. The broken old
worktree was subsequently preserved and reconstructed at its exact official
tag. These alpha.1 findings are retained as history; the current rc.1
verification below supersedes them for active development.

The follow-up public npm download smoke (2026-09-05 00:28 UTC) selected the
actual alpha.1 candidate graph: five vendor archives were downloaded and
integrity-checked, 15 exact first-party versions returned E404, and four
external ranges remained deferred. A second selected-package run reported a
verified cache hit. The downloader did not install dependencies or write
Registry/audit evidence; its partial result did not clear alpha.1 publication.
It is not a current rc.1 package-availability report. The rc.1 switch uses the
separate complete Registry and same-channel runtime gates below.

## Current stable/edge verification — 2026-09-05

Both channels select official tag `dsh-v0.1.2-rc.1`, commit
`a66e4702047846cdaa10c66c9d3df3951f5ea70d`. Its clean detached worktree was
freshly installed with the frozen lock and built through `build:official`
using Node `26.4.0` and pnpm `11.7.0` on macOS arm64. The normal local Harness
checkout used by `DSH_HARNESS_ROOT` is also detached at rc.1 and rebuilt;
its branch history and previous baseline directories remain intact.

The normal checkout also passes strict context validation (387 checks,
zero warnings) after orphan-output isolation and a forced TypeScript rebuild.
Default companion analysis resolves rc.1 for both base and HEAD, with zero
changed paths and no issues. Newly generated source and Registry fixtures
select stable rc.1 without a channel override; their pre-install strict
checks pass (71 source / 54 Registry checks). A source fixture explicitly
using the normal local checkout also passes all 71 checks. Source verifiers
use the same root as their static links; an unrelated inherited
`DSH_HARNESS_ROOT` is not a link migration.

| Evidence | Stable rc.1 | Edge rc.1 |
|---|---|---|
| Build freshness, typecheck, strict source | Passed | Passed |
| Repository units | 36 passed, 1 conditional skip | 36 passed, 1 conditional skip |
| Repository e2e | 3 passed, 2 skips | 3 passed, 2 skips |
| Source Tool Loader/HMR, build/pack, profile boot/SIGTERM/remove | Passed | Passed |
| Exact Registry archive, clean consumer import and profile lifecycle | Passed | Passed |
| Unready Registry generation refusal | Not applicable | Not applicable |
| Public Registry requirements | 24 available, 0 blocked | 24 available, 0 blocked |
| Real-model marketplace semantic leg | Not run | Not run |

The unit skip is the opposite Registry-state branch. The e2e skips are the
opposite Registry-state branch and the explicitly disabled real-model leg.
The deterministic marketplace install/reinstall/remove and both packaged
Skills are verified. Both source profile boot and ordinary-dependency archive
installation are exercised with the same rc.1 CLI, without cross-version
package fallback. All profile tests use isolated homes, not user Sessions.

`node scripts/baseline.mjs verify --channel stable` and the equivalent edge
command generate schema-v2 reports, binding the current project, selected
catalog and exact Registry report/status. They run the complete `pnpm verify`
with the locked toolchain. Re-run them after edits to this document; do not
manually update a passed digest. The reports under `baselines/` are the
authoritative current bindings. The rc.1 candidate was promoted only after
the ready Registry report and full edge verification passed; both channels'
final preflight gates pass.

Regression coverage now also exercises the actual copied baseline CLI:
historical unbound, source-only and rechecked-Registry reports refuse
preflight; a correctly bound ready report passes, and promotion preserves
the binding after channel relabeling. Fixtures use no live Registry or real
repository mutation.

The rc.1-specific upstream regressions pass **91 tests across five files**,
covering declared version compatibility, legacy-bootstrap version refusal,
derived-record backup/skip, lineage validation and archived v3/v4/v5 recovery.
Reproduce from the clean rc.1 worktree:

```sh
CI=true DSH_TELEMETRY_DISABLED=1 pnpm exec vitest run \
  packages/storage/storage-domain/tests \
  packages/storage/storage-json/tests \
  packages/session/session-projection-cache/tests
```

This is targeted upstream correctness evidence, not the full Harness suite,
cross-platform certification or a downgrade of alpha.1 format-v2 Sessions.
Service/Client/LLM/Team generators and the real-model semantic leg remain
outside current deterministic acceptance.

## Historical alpha.1 verification — no longer the active baseline

The previous stable alpha.4 report covered source and Registry Tool delivery;
the former edge alpha.1 report covered source delivery and explicit Registry
refusal (9 available requirements, 15 E404s). Those reports are superseded by
rc.1 for both active channels. Previous targeted upstream verification, all
against the exact alpha.1 worktree:

- 551 tests / 13 files: JSONL generation, write leases and storage; released
  v0/v1 migration codecs; Agent-loop resume and contract regressions.
- 208 tests / 13 files: Team persistence/tool behavior; HTTP proxy policy and
  installation; Host/Client file upload; session-controller assistant stream,
  cold Session and file-reference paths; Conversation assembly and LLM
  assistant-stream encoding.
- 67 tests / 2 files: Session-query reads and observation behavior.

Reproduce from that clean candidate with `CI=true DSH_TELEMETRY_DISABLED=1
pnpm exec vitest run` and these selectors:

```text
packages/session/session-persistence-jsonl/tests/generation.spec.ts
packages/session/session-persistence-jsonl/tests/lease.spec.ts
packages/session/session-persistence-jsonl/tests/jsonl.spec.ts
packages/session/session-format-v0-to-v1/tests
packages/session/session-format-v1-to-v2/tests
packages/core/agent-loop/tests/resume.spec.ts
packages/core/agent-loop/tests/contract-regressions.spec.ts
packages/experimental/agent-team/tests/persistence.spec.ts
packages/experimental/tool-agent-team/tests/tool-team.spec.ts
packages/util/http-proxy/tests
packages/client/file-upload/tests
packages/api/session-controller/tests/assistant-stream.host.spec.ts
packages/api/session-controller/tests/assistant-stream.client.spec.ts
packages/api/session-controller/tests/session-cold.host.spec.ts
packages/api/session-controller/tests/file-references.host.spec.ts
packages/client/ui-conversation/tests/conversation-assembler.client.spec.ts
packages/llm/llm/tests/assistant-stream.spec.ts
packages/session-query/session-query/tests/session-query.spec.ts
packages/session-query/session-query/tests/observation.spec.ts
```

This is targeted upstream regression evidence, not a full Harness suite,
production data migration or cross-platform certification. The official
[alpha.1 release notes](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.1)
identify a historical-session loading performance regression. Representative
cold-open/query latency and memory budgets remain a deployment gate; passing
the correctness suites did not clear it. That historical run did not promote
alpha.1 or establish any new deterministic P4 project kind. It is not rc.1
runtime or performance evidence.

## Empty-directory acceptance

From a temporary empty directory, the supported Tool vertical slice must:

1. invoke the installed `dsh-plugin-dev` generator with a business-shaped name and description;
2. create a package manifest, TypeScript source, runtime Config schema, tests,
   Loader fixture with stable row ids, exported bundle patch, thin `AGENTS.md`
   and `CLAUDE.md` adapters, project contract, TODO, and copied DSH reference
   lock;
3. refuse a second generation that would overwrite those files;
4. install its development closure against the audited local Harness source;
5. pass strict source/build-entry validation, typecheck, Config boundary and
   exact-schema tests, unit/HMR tests, real `cordis.yml` Loader composition,
   build, public-name import from `lib`, and inspection of a real `.tgz`;
6. expose no namespace-plugin default export;
7. add/dump/boot/gracefully stop/remove the actual bundle through an isolated
   pinned DSH profile and prove its Loader row/config appears and disappears;
8. resynchronize its `link:` dependencies after a Harness checkout move;
9. remain marked private while its DSH dependency closure is source-linked and
   omit accidental source/declaration maps from the package.

Registry delivery acceptance additionally requires generation without a local
Harness path, a digest-valid copied `ready` report, exact ordinary dependency
specifications with no `link:`/`workspace:` value, `private: false` plus public
access, clean install and verification, exact `.tgz` install/import from a
second clean directory, and pinned-CLI profile add/dump/real boot/graceful
shutdown/remove/post-remove absence.

## Packaged marketplace smoke

The packaged Codex Plugin path installs through a local marketplace instead of
the user-skill symlink. `tests/plugin-marketplace.e2e.test.ts` materializes a
marketplace fixture (`.agents/plugins/marketplace.json` plus
`plugins/dsh-plugin-dev/` carrying the repo's `.codex-plugin/` and `skills/`)
into a temporary directory and drives an isolated `CODEX_HOME` through
`codex plugin marketplace add`, `plugin list --available`,
`plugin add dsh-plugin-dev@dsh-plugin-dev-local`, an idempotent reinstall, a
byte-exact cached-Skill comparison against the canonical source,
`plugin remove` (cache cleared), and marketplace removal. The leg self-skips
when no `codex` binary is present.

The real-model semantic leg runs only with `DSH_CODEX_SEMANTIC=1`: it copies
the user's Codex auth into the isolated home, installs the plugin through the
marketplace, runs `codex exec` from an empty directory with the repository
audit prompt, and asserts the agent names the Skill, generates
`dsh-repository-audit`, and passes the generated dependency-free strict source
check against the pinned Harness. A failed run preserves its scratch directory
for inspection.

Marketplace lifecycle evidence (2026-09-01, codex-cli 0.151.0): the
deterministic leg passes locally — marketplace registration, packaged install,
reinstall, byte-exact Skill delivery, and clean removal all succeeded under an
isolated `CODEX_HOME`. The semantic leg is recorded as pending: at run time the
machine could not reach the Codex backend (`codex doctor`: Responses WebSocket
timeout, CDN unreachable), so no real-model evidence was captured. Re-run with
`DSH_CODEX_SEMANTIC=1 pnpm exec vitest run tests/plugin-marketplace.e2e.test.ts`
once connectivity is restored.

## Fresh-agent semantic smoke

After `pnpm install:skill`, start new Codex and Claude Code sessions from unrelated empty directories. Use:

```text
Use $dsh-plugin-dev to create a DSH tool plugin named dsh-repository-audit.
It accepts a repository path and returns a structured audit summary.
Explain the selected plugin shape, generate the project here, and report the
verification you can actually run. Do not claim npm publication readiness.
```

and:

```text
/dsh-plugin-dev Create a DSH tool plugin named dsh-repository-audit.
It accepts a repository path and returns a structured audit summary.
Explain the selected plugin shape, generate the project here, and report the
verification you can actually run. Do not claim npm publication readiness.
```

Acceptance requires both agents to identify the Tool shape, use the deterministic generator, select and explain an audited delivery route, and continue beyond the generic baseline into request-specific code and tests.

Latest recorded evidence (2026-08-29): a fresh ephemeral Codex process started in an unrelated empty directory, discovered the installed user Skill, selected the Tool shape, generated `dsh-count-typescript-files`, and replaced the baseline with real recursive filesystem behavior. The resulting project passed 30 strict source checks, 10 Tool/Loader/HMR/cancellation tests, typecheck, build, an 11-file packed-artifact check, and an isolated DSH profile add/dump/boot/remove lifecycle. It also reported the source-linked publication boundary instead of claiming registry readiness.

Claude Code evidence (2026-08-29): Claude Code `2.1.251`, authenticated through its configured account, started in an unrelated empty directory and resolved the personal `/dsh-plugin-dev` Skill through the installed symlink. It used the deterministic generator to create `dsh-count-markdown-files`, replaced the generic baseline with canonical recursive filesystem behavior, corrected a TypeScript `Dirent` error through its own verification loop, and documented the source-linked boundary. Independent reruns passed 30 strict source checks, typecheck, 17 Tool/Loader/HMR/cancellation and external-filesystem tests, build, and a 7-file packed-artifact check. An outer isolated profile smoke additionally passed add, effective dump, real headless boot, remove, and post-remove absence using the pinned Harness CLI.

Registry delivery evidence (2026-08-31): against official
`dsh-v0.1.2-alpha.2`, the repository passed 207 strict checks, 21 unit tests,
and two generated-project e2e paths. The Registry path generated without a
Harness root, installed ordinary exact dependencies, passed its own 2-file/9-
test verification, packed once, installed/imported that archive in a second
clean consumer, then passed official CLI profile add, effective dump, real
boot, graceful SIGTERM shutdown, remove, and post-remove absence. Its audited
Tool closure report recorded 24 available requirements and zero blocked.

TypeScript-first tooling evidence (2026-08-31): all four public command
implementations compile under the strict project configuration, their `.mjs`
and `.d.mts` outputs byte-match a clean temporary compile and the
source/output digest manifest, 272 context checks pass, and the same 21 unit
plus two source/Registry e2e tests pass through TypeScript/Vitest.

## Baseline evolution acceptance

An upstream baseline update is acceptable when a clean official tagged
worktree scans deterministically into edge, stable-to-edge diff reports package,
Skill, toolchain, and Tool-closure changes, both official Cordis product Skills
match their materialized hashes, strict source and the complete repository
verification ladder pass against edge, and Registry status is persisted.

Promotion additionally requires the Registry report to be `ready` and the
verification report to be `passed`, with both reports bound to the same catalog
and current project-contract digests, plus the exact ready Registry report
used by that verification run. A `blocked` Registry report is successful
edge evidence but must make promotion and release preflight fail.

## Future scaffold acceptance

Each new deterministic plugin kind needs the same minimum evidence before it becomes supported: validated public contract, configuration failure/default tests, lifecycle disposal, real Loader composition, one external-world assertion, generated-project build, and an honest delivery route. Client, persistence, background work, and LLM adapters add their applicable reconnect, replay, cancellation, quiescence, and provider-protocol tiers.
