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

For a Git source dependency, the package must build during installation,
normally through `prepare`. Modern pnpm may block dependency build scripts
until the exact package is allowlisted. Registry tarballs should already
contain built output and are a safer distribution path.

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
6. Packed artifact: `npm pack`, install into a clean temp directory, and import
   or boot with ordinary Node resolution.
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
- README commands use the public CLI rather than a test-only driver.
