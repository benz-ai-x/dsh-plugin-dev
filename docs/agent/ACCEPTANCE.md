# Acceptance

## Repository acceptance

- `.codex-plugin/plugin.json` validates as a skills-only Codex Plugin and points at the canonical skill directory.
- Codex repository discovery, Codex Plugin discovery, and the Claude Code adapter reach one canonical `SKILL.md` body.
- Every routed reference exists, and scaffolding instructions select only the references required by the requested DSH shape.
- The pinned Harness checkout resolves through `DSH_HARNESS_ROOT` or the recorded fallback; version, commit, docs digest, and Node engine match the lock; tracked/non-ignored inputs are clean; the ignored root `.env` loaded by the source CLI is absent; and every directly linked package has present, fresh declared build entries. Ignored dependency/build output is allowed.
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
7. add/dump/remove the actual bundle through an isolated pinned DSH profile and
   prove the expected stable Loader row/config appears and disappears;
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
and current project-contract digests. A `blocked` Registry report is successful
edge evidence but must make promotion and release preflight fail.

## Future scaffold acceptance

Each new deterministic plugin kind needs the same minimum evidence before it becomes supported: validated public contract, configuration failure/default tests, lifecycle disposal, real Loader composition, one external-world assertion, generated-project build, and an honest delivery route. Client, persistence, background work, and LLM adapters add their applicable reconnect, replay, cancellation, quiescence, and provider-protocol tiers.
