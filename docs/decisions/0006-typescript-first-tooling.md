# 0006 — TypeScript-first tooling with dependency-free runtime artifacts

Status: Accepted  
Date: 2026-08-31

## Context

The repository began as a small, dependency-free collection of Node `.mjs`
scripts. The generator, baseline manager, context validator, installer, and
their tests grew to more than three thousand lines and now exchange versioned
catalogs, Registry evidence, template contracts, and stable error results.
Those boundaries benefit materially from compile-time exhaustiveness and
structural checks. The official DeepSeek Harness is also TypeScript-first.

At the same time, a user-level Skill can be linked or copied without running a
package installation. Its documented `node .../create-project.mjs` command and
the generated project's pre-install validators must therefore remain runnable
with ordinary Node and no `tsx` dependency.

## Decision

- Author generator, baseline, context, installer, test, and build logic in
  strict TypeScript. Explicit ESM entry sources use `.mts` so TypeScript emits
  the established `.mjs` ABI directly.
- Compile the four public tooling entries into their existing `.mjs` paths and
  emit adjacent `.d.mts` declarations. These generated files are committed and
  included in distribution.
- Record compiler identity plus SHA-256 for every source, runtime, and
  declaration in `tooling-artifacts.json`.
- Make `pnpm build:check` compile into a temporary directory and compare the
  exact output and manifest without mutating the worktree. Repository
  verification requires this gate and strict typecheck.
- Run repository tests as TypeScript through Vitest. Preserve the generated
  project's dependency-free `.mjs` verifier templates because they are
  deliberately executable before `pnpm install`; its plugin implementation,
  configuration, and behavioral tests remain TypeScript.

## Consequences

- Contributors edit TypeScript sources, never compiled `.mjs` or `.d.mts`
  artifacts, and run `pnpm build` after source changes.
- Installed Skills keep their stable Node command paths and gain no runtime
  dependency on TypeScript, tsx, or Vitest.
- Field drift across baseline catalogs, Registry reports, generator options,
  template values, and tests now fails during strict typecheck.
- Adding a tooling entry requires updating the build artifact inventory and
  repository context checks in the same change.
