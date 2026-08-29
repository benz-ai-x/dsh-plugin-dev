# Acceptance

## Repository acceptance

- `.codex-plugin/plugin.json` validates as a skills-only Codex Plugin and points at the canonical skill directory.
- Codex repository discovery, Codex Plugin discovery, and the Claude Code adapter reach one canonical `SKILL.md` body.
- Every routed reference exists, and scaffolding instructions select only the references required by the requested DSH shape.
- The pinned Harness checkout resolves through `DSH_HARNESS_ROOT` or the recorded fallback; version, commit, docs digest, and Node engine match the lock; tracked/non-ignored inputs are clean; the ignored root `.env` loaded by the source CLI is absent; and every directly linked package has present, fresh declared build entries. Ignored dependency/build output is allowed.
- The user-skill installer preflights and creates both Codex and Claude Code personal links, is idempotent for the same source, supports either agent independently, and refuses partial installation when either target conflicts.
- Unit tests cover generator validation, reserved `run_code` rejection,
  collision refusal, deterministic output, dual-Agent templates, and
  unsupported plugin kinds.

Run:

```sh
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

Acceptance requires both agents to identify the Tool shape, use the deterministic generator, retain the pinned source route, and continue beyond the generic baseline into request-specific code and tests.

Latest recorded evidence (2026-08-29): a fresh ephemeral Codex process started in an unrelated empty directory, discovered the installed user Skill, selected the Tool shape, generated `dsh-count-typescript-files`, and replaced the baseline with real recursive filesystem behavior. The resulting project passed 30 strict source checks, 10 Tool/Loader/HMR/cancellation tests, typecheck, build, an 11-file packed-artifact check, and an isolated DSH profile add/dump/boot/remove lifecycle. It also reported the source-linked publication boundary instead of claiming registry readiness.

Claude Code evidence (2026-08-29): Claude Code `2.1.251`, authenticated through its configured account, started in an unrelated empty directory and resolved the personal `/dsh-plugin-dev` Skill through the installed symlink. It used the deterministic generator to create `dsh-count-markdown-files`, replaced the generic baseline with canonical recursive filesystem behavior, corrected a TypeScript `Dirent` error through its own verification loop, and documented the source-linked boundary. Independent reruns passed 30 strict source checks, typecheck, 17 Tool/Loader/HMR/cancellation and external-filesystem tests, build, and a 7-file packed-artifact check. An outer isolated profile smoke additionally passed add, effective dump, real headless boot, remove, and post-remove absence using the pinned Harness CLI.

## Future scaffold acceptance

Each new deterministic plugin kind needs the same minimum evidence before it becomes supported: validated public contract, configuration failure/default tests, lifecycle disposal, real Loader composition, one external-world assertion, generated-project build, and an honest delivery route. Client, persistence, background work, and LLM adapters add their applicable reconnect, replay, cancellation, quiescence, and provider-protocol tiers.
