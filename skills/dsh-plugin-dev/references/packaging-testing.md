# Packaging, Profiles, and Testing

Read this reference when creating a package, composing a bundle, installing a
plugin, testing Loader/HMR behavior, or preparing publication.

## Package baseline

Use ESM and ship built JavaScript plus declarations. A typical Host-only package
has this shape:

```json
{
  "name": "dsh-example-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": [
    "lib/index.js",
    "lib/types/**/*.d.ts"
  ]
}
```

Add only exports the package actually builds. A Client plugin adds `./client`;
a Definition may add browser-safe `./client` or `./types`; a bundle exports its
patch file. Test the published `files` list rather than assuming the workspace
tree represents the tarball.

Import the package through its public name after build so Node traverses
`exports` and the actual `lib` entry. Then create the real `.tgz` archive and
inspect that archive's file list; a dry-run manifest alone does not prove the
reported artifact exists. Unless source maps are a deliberate supported
deliverable, omit `.js.map` and `.d.ts.map` from `files` and reject them in the
pack smoke.

Cordis and DSH contract packages normally belong in `peerDependencies` and are
mirrored in `devDependencies` for local build/test. Schemastery belongs in
`dependencies` when runtime schema code imports it. An external project uses
real compatible versions, never `workspace:^`.

Canonical reading:

- `docs/cookbook/adding-a-package.md`
- `docs/user/develop/basic/publish.md`
- `docs/development.md`
- `packages/todo/tool-todo/package.json`
- `packages/client/ui-goal/package.json`

## Bundle versus profile

A bundle package contributes one ordered patch layer:

```json
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

Its patch inserts or overrides Loader rows with stable ids:

```yaml
- insert:
    - id: example-plugin
      name: 'dsh-example-plugin'
      config:
        timeoutMs: 30000
```

A profile manifest selects bundle packages in order. Do not confuse a bundle's
“what layer do I contribute?” declaration with a profile's “which layers do I
activate?” declaration. A package must not masquerade as both a bundle and a
profile.

A plain dependency without `dsh.bundle.patch` installs but does not activate a
profile layer. This is correct for libraries and a warning for a package the
user expected to enable.

Canonical implementations:

- `packages/bundle/base/package.json`
- `packages/bundle/base/cordis.patch.yml`
- `packages/boot/app-boot/src/profile.ts`
- `apps/cli/src/plugin.ts`

A bundle that defines a runnable app (a surface bundle) can mount a provider
plugin that declares `inject: ['cmdlineArgs']`, parses the shared immutable
argument snapshot with `parseCmdline` from `@deepseek-ai/dsh-cmdline`, and
feeds dependent rows through `!!js` config expressions with deployment
fallbacks. Those rows stay inactive on `--help` because the provider publishes
no service then. This pattern is upstream territory outside the deterministic
Tool template; walk through `publish.md`'s surface-bundle section before
building one.

Canonical reading:

- `docs/user/develop/basic/publish.md` — "Give a surface bundle its own command line"
- `packages/boot/cmdline/README.md`
- `packages/bundle/web-app/cordis.patch.yml` — an in-tree bundle overriding `dsh-base` rows

## Patch semantics

Profile composition starts with an empty root and applies bundle patches,
profile patch, Harness-home patch, then command-line overlays. A later patch
targeting an id replaces that row's complete `config`. Restate every field that
must survive.

Use explicit overlay patches for mode-specific composition. In the pinned
source, `!!js` is evaluated recursively inside row `config` after declared
injections are available, and in row `disabled`; other row metadata remains
literal.

Inspect before boot:

```sh
dsh --profile demo --dump-config
```

The dump is diagnostic and loadable, but its byte formatting is not a stable
serialization contract.

## Local installation

From the directory containing a plugin checkout:

```sh
dsh plugin --profile demo add ./plugin-directory
dsh --profile demo --dump-config
dsh --profile demo
dsh plugin --profile demo remove dsh-example-plugin
```

`dsh plugin` forwards to pnpm inside the profile and anchors relative path specs
to the user's invoking directory. On successful pnpm operations, it reconciles
the installed packages that currently declare `dsh.bundle`.

The first successful `add` initializes the profile with `@deepseek-ai/dsh-base`
as its first bundle, then appends each installed bundle in add order. In-box
bundle names resolve from the dsh installation itself — pnpm manages only
out-of-tree packages — so a bundle can rely on `@deepseek-ai/dsh-base` being
present and current without declaring or installing it.

For a Git source dependency, the install fetches sources, not built artifacts:
nothing runs the package's `build` script, so the author ships a self-contained
`prepare` that builds the published entry points without assuming dev-only
context such as a sibling monorepo. On the user side, pnpm ≥10 blocks the
dependency's `prepare` until the exact package key from its error message is
allowlisted in the profile's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-example-plugin: true
```

The first `add` fails; copy the key pnpm printed and re-run. Treat that entry
as permission to execute the package's code at install time, outside the
agent's sandbox: allow only trusted sources and pin a commit
(`github:you/example#<sha>`). Registry tarballs that already contain built
output need no allowance and are the safer distribution path.

For a source-linked project, distinguish the source plane from the executable
artifact plane. Matching the pinned commit and docs is insufficient when
package manifests resolve `main`/`types` into ignored `lib` directories. Before
claiming source compatibility, require clean tracked/non-ignored Harness
inputs and reject the ignored root `.env` that the source CLI would load.
Ignored dependency/build output may remain. Require every directly linked
package's declared entries to exist and be at least as fresh as its
manifest/source inputs. This timestamp guard catches missing and obviously
stale builds; it is not a content-addressed proof, so publication still
requires a clean ordinary-resolution packed install.

For Registry delivery, retain the digest-bound closure report with the
generated project. Exact ordinary dependency specifications and a successful
install prove what was resolved at that time; the report is not a promise that
the Registry will remain available forever. Reject `link:` and `workspace:`
specifiers, install the final graph in a clean directory, pack once, and use
that exact archive for import and profile acceptance. Do not rebuild a
different artifact between verification and publication.

## Test ladder

Use the lowest useful test, but do not stop below the surface that ships:

1. Pure/unit: validation, folds, serialization, state machines, error mapping.
2. Cordis/plugin: real services and registries with external boundaries mocked.
3. HMR/lifecycle: contribution exists, Fiber disposes, contribution and work
   disappear, replacement restores the correct state.
4. Loader: actual `cordis.yml`, actual Loader/Include resolution, runtime schema
   validation, and declared injection behavior.
5. Profile/application: launch the real CLI/profile or process and assert a
   model-visible, durable, filesystem, protocol, or user-visible outcome.
6. Packed artifact: create the real archive with `pnpm pack`/`npm pack`, inspect
   it, install it into a clean temp directory, and import or boot with ordinary
   Node resolution.
7. Real external service: credential-gated only where the actual provider
   protocol is part of the contract.

Mock external services or nondeterministic inputs, not the code under test.
Line coverage cannot demonstrate Loader metadata, profile reachability, package
contents, cancellation quiescence, or user-visible behavior.

Canonical policy and examples:

- `docs/testing.md`
- `packages/todo/tool-todo/tests/loader-composition.spec.ts`
- `apps/cli/tests/profiles/acp/tests/acp.e2e.ts`
- `apps/cli/tests/built-bin.e2e.ts`
- `docs/postmortem/0001-acp-default-export-drops-inject.md`

## Documentation and release

Document configuration, exact model/user experience, token and KV-cache effect,
security/authority boundary, operational setup, and known limitations. Keep
deployment decisions out of hidden constants.

Before publication verify:

- all dependencies resolve outside the source monorepo;
- no required package is private or omitted from the tarball;
- `exports`, declarations, Client assets, patch file, and prepare/build scripts
  match the advertised install form;
- add, dump, boot, HMR/restart as applicable, and remove all work;
- post-remove config no longer contains the bundle, and the boot process
  handles its ordinary supervisor shutdown signal cleanly;
- README commands use the public CLI rather than a test-only driver.
