# New Project Scaffolding

Read this reference when the user wants to create a DSH plugin project in an empty or unrelated directory from a business requirement.

## Split interpretation from materialization

The agent owns natural-language interpretation and implementation judgment. Convert the request into a small scaffold specification, then use the deterministic generator to validate names, bind an audited source or Registry delivery contract, and create the baseline. The generator does not implement the user's domain behavior for you.

Record before generation:

- the exact model-visible, user-visible, protocol-visible, or external-world outcome;
- the DSH plugin kind and why that shape owns the capability;
- package name, Cordis plugin name, and any model-facing tool name;
- required services, authority source, durable commit point, cancellation owner, and disposal settlement;
- configuration values that deployments may vary;
- the first external-world acceptance assertion;
- Host-only, Host/Client, bundle, profile, and publication boundaries.

Ask the user only when a missing choice changes authority, persistence, external side effects, package boundaries, or the supported product surface. Infer reversible naming and starter defaults when the intent is otherwise clear.

## Supported deterministic kind

The current generator supports `tool`: one Host-side namespace plugin that registers a model-facing tool and ships a bundle patch. It creates a safe normalization baseline so the real Tool registry, schema, cancellation, HMR, Loader, build, and package paths are executable immediately.

Do not present that normalization body as the requested business implementation. Replace its parameters, canonical output, executor, configuration, tests, README, and TODO with the actual product contract before completing the user's task.

For Service, Client, LLM adapter, Agent Team, or library-only requests, do not coerce the request into `tool`. Follow the applicable references and create the project deliberately until that generator kind exists.

## Generator command

Resolve this reference's skill directory, then run its sibling script:

```sh
node <skill-directory>/scripts/create-project.mjs \
  --target <project-directory> \
  --kind tool \
  --name dsh-example \
  --plugin-name example \
  --tool-name example \
  --description "Describe the model-visible operation precisely." \
  --channel stable \
  --delivery registry
```

`--target` defaults to the current directory. `--name`, `--plugin-name`, and `--tool-name` derive from the target directory when omitted. `--channel` defaults to the repository lock's `stable` channel; use `edge` only for an explicit candidate migration.

`--delivery` defaults to `source` for backward-compatible local development.
Source delivery requires the exact clean built Harness and accepts
`--harness-root`; resolution then tries the explicit option, selected baseline
environment, target sibling, locked fallback, and generic `DSH_HARNESS_ROOT`.
Registry delivery rejects `--harness-root`, requires the selected channel's
Tool closure report to be digest-valid and `ready`, emits exact ordinary
development dependencies with no `link:`/`workspace:` specifications, copies
that evidence into `dsh-registry.lock.json`, and creates a public, non-private
package baseline.

The generator accepts lowercase npm package names, kebab-case Cordis plugin names, and snake_case tool names except the registry-reserved `run_code`. It refuses unsupported kinds or delivery modes, unready/stale Registry evidence, a mismatched or dirty source worktree, missing/stale linked build entries, a non-empty target, and every output collision. It also pins the Harness Node engine and rejects a generator process outside it. It never has a force or overwrite mode.

Stable generator failures:

| Code | Meaning |
|---|---|
| `DSH_SCAFFOLD_USAGE` | A required option value is missing or an unknown argument was supplied. |
| `DSH_SCAFFOLD_INVALID_NAME` | A package, plugin, or tool name violates its public naming contract. |
| `DSH_SCAFFOLD_RESERVED_NAME` | The requested/derived tool name is reserved by DSH (`run_code`). |
| `DSH_SCAFFOLD_INVALID_DESCRIPTION` | The product description is empty or too large for a stable scaffold boundary. |
| `DSH_SCAFFOLD_UNSUPPORTED_KIND` | No deterministic template exists for the requested plugin kind. |
| `DSH_SCAFFOLD_UNSUPPORTED_DELIVERY` | Delivery is neither `source` nor `registry`. |
| `DSH_SCAFFOLD_REGISTRY_UNREADY` | Registry delivery was requested without a current digest-bound `ready` closure report. |
| `DSH_SCAFFOLD_TARGET_NOT_EMPTY` | The target contains project material; generation did not start. |
| `DSH_SCAFFOLD_TARGET_COLLISION` | A generated path appeared before its exclusive write; no overwrite occurred. |
| `DSH_SCAFFOLD_HARNESS_NOT_FOUND` | No usable local Harness checkout resolved. |
| `DSH_SCAFFOLD_HARNESS_MISMATCH` | The checkout does not match the audited lock. |
| `DSH_SCAFFOLD_HARNESS_DIRTY` | The Harness has tracked/non-ignored changes or an ignored root `.env` that would affect the source CLI. |
| `DSH_SCAFFOLD_HARNESS_ARTIFACT_MISSING` | A directly linked package's declared build entry is absent. |
| `DSH_SCAFFOLD_HARNESS_ARTIFACT_STALE` | A linked build entry predates its manifest/source inputs. |
| `DSH_SCAFFOLD_NODE_UNSUPPORTED` | The running Node version is outside the pinned Harness engine. |

## After generation

1. Read the generated `docs/agent/PROJECT_CONTRACT.md`, `TODO.md`, and reference lock.
2. Before dependencies exist, run `node scripts/verify-dsh-context.mjs
   --require-source` for source delivery or `--require-registry` for Registry
   delivery; invoking a package script may cause pnpm to install first.
3. Run `pnpm install`, then use `pnpm context:check:strict` normally. Registry
   mode's clean ordinary resolution is delivery evidence; source mode
   materializes the local links.
4. In source mode only, if the Harness checkout moves, set `DSH_HARNESS_ROOT`
   (or pass `--harness-root`) and run `pnpm context:sync`. It rewrites links and
   refreshes the package-manager lock. Registry mode deliberately has no
   `context:sync`; migrate its audited versions instead.
5. Replace the normalization baseline with the user's actual domain contract and add a failing test first when the request asks for test-driven work.
6. Preserve named namespace exports, runtime Config validation, cancellation propagation, canonical JSON results, and lifecycle cleanup.
7. Run `pnpm verify`, then exercise the real `dsh plugin add`, config dump, boot, and remove path when the local CLI/profile is in scope.
8. Report the selected delivery honestly: source verification proves pinned
   checkout compatibility only; Registry readiness permits publication work
   but does not replace final project-specific archive/profile verification.
9. To adopt a newer Harness baseline, regenerate the selected schema-v2 lock
   and dependency/toolchain specifications as an explicit reviewable migration,
   repeat the applicable source synchronization or Registry evidence refresh
   and the full verification ladder. Never change a generated project's
   channel, delivery mode, or dependency specifications implicitly.

Source projects remain `private: true`. Registry projects are generated as
public/non-private only from a `ready` closure, but publication still waits for
the implemented business contract, a clean packed-artifact install/import,
and real DSH profile add/dump/boot/remove evidence for the exact archive.
