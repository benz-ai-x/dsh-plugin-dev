# Core DSH Contracts

Read this reference for every DSH plugin task.

## Runtime model

DSH is one Cordis plugin tree assembled from ordered profile patch layers. A
plugin contributes behavior to that tree; it does not construct another root
Context or executable. Use the existing application profile unless the product
is genuinely a new application surface.

The effective layer order is:

1. bundle patches in profile order;
2. the profile's `cordis.patch.yml`;
3. the Harness-home patch;
4. command-line `--patch` overlays.

Later patches win. A targeted patch replaces the complete row `config`; it does
not deep-merge fields. Row order is for readers, while declared service
availability controls activation.

Canonical reading in the pinned Harness source:

- `docs/architecture.md`
- `docs/cordis-primer.md`
- `docs/cordis-tutorial/`
- `docs/user/develop/framework/`
- `docs/module-graph.md`

## Plugin forms and export normalization

Cordis accepts a function, an object with `apply`, or a Service class. For a
namespace function plugin, keep metadata as named exports:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'example-plugin'
export const inject = ['exampleDependency']

export function apply(ctx: Context): void {
  // register scoped behavior
}
```

Do not append `export default apply`. Loader normalizes a module with
`exports.default ?? exports`; the default bare function would discard sibling
`name`, `inject`, and `Config` exports. Service packages instead normally
default-export their Service class.

That same normalization means metadata for a default-exported concrete Service
class belongs on the class itself:

```ts
export default class ExampleProvider extends ExampleService {
  static inject = ['credentials']
  static Config = Config
}
```

A sibling named `inject` or `Config` export is not consulted after Loader has
selected the default class. Point the static field at an exported schema when
library consumers also need that schema. If the package deliberately uses a
namespace wrapper instead, keep all metadata and `apply` on that namespace and
let the wrapper lifecycle-own the Service; do not mix the two normalization
forms.

Canonical implementation and regression evidence:

- `vendor/loader/src/index.ts` — `unwrapExports()`
- `docs/postmortem/0001-acp-default-export-drops-inject.md`
- `packages/todo/tool-todo/tests/tool-todo.spec.ts`

## Dependency and topology semantics

Declare hard dependencies through `inject`. A consumer waits for all declared
services; if a provider disappears, Cordis unloads dependent consumers and may
activate them again when the topology becomes valid.

Do not use YAML order as dependency order. Do not read a topology-sensitive
`ctx.<service>` property from a callback that runs outside the declaring
plugin's injection scope.

For optional behavior:

- use `ctx.get('serviceName')` for one optional global lookup;
- use a child `ctx.inject(['optionalService'], callback)` when a scoped
  contribution should appear and disappear with that service.

Use `ctx.extend`, `ctx.isolate`, and `ctx.intercept` only when the capability
needs their precise scope or service-view semantics. The Context that registers
a resource owns its visibility and lifecycle.

## Service publication

A Service Definition declares its Context merge and abstract or stable API:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    example: ExampleService
  }
}

export abstract class ExampleService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'example')
  }

  abstract run(input: string, signal: AbortSignal): Promise<string>
}

export default ExampleService
```

Provider packages implement the Definition; consumers depend on the Definition,
not a concrete provider. Split these roles only when providers or consumers
really evolve independently.

## Configuration

Every public configuration field needs both a TypeScript type and a runtime
Standard Schema with the same exported name:

```ts
import z from '@deepseek-ai/schemastery'

export interface Config {
  timeoutMs: number
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().min(1).default(30_000),
})
```

Use schema defaults for universal defaults. Keep deployment choices required
when no universal choice is justified. Do not expose runtime-only test hooks or
transport objects as YAML configuration.

`!!js` expressions are supported recursively inside plugin `config`. A row's
`config` expressions evaluate after its declared injections activate, against
that row's own plugin context (`ctx.serviceName` is readable there); the
entry's `disabled` field evaluates at every mount decision against the Loader
context. Other entry metadata stays literal. Conditional trees should normally
use explicit overlay patches rather than clever metadata expressions.

Canonical reading:

- `docs/user/develop/basic/config.md`
- `docs/config-catalog.md`
- `vendor/loader/src/config/entry.ts`
- `docs/postmortem/0002-js-expression-disabled-filesystem-tools.md`

## Effects, asynchronous work, and disposal

Every effect must be reversible. Use the disposer returned by a registry or
register cleanup with `ctx.effect`. When teardown order matters, return one
composite disposer that performs the required serial order. Independent sibling
effects may dispose concurrently.

For long-running work:

1. reject new admission after disposal starts;
2. abort work owned by the plugin;
3. wait for callbacks, streams, workers, subprocesses, and queued commits to
   settle;
4. remove public registrations;
5. resolve disposal only after the plugin is silent.

Once a task is durably published to a holder-owned registry, caller
cancellation may no longer own it. Make the ownership-transfer point explicit.

Test contribution presence before disposal and absence afterward. A cleanup
function existing in code is not evidence that teardown works.

## Events and durable state

Cordis events are live process coordination. Session events are append-only
durable facts. Use a Session event when behavior must survive restart, replay,
or appear consistently in queries and clients.

Session event values must be lossless JSON. Treat appended values as detached
and immutable. Event sequence positions crossing Session, persistence, and
projection APIs are branded numbers (`SessionSeq`, `SessionLogOffset`): pass
the exported constructors, not raw numbers, or the call will not typecheck.
`SessionEventMap` is declaration-merge extensible at compile
time, while the pinned persistence runtime has no out-of-repo registration
surface and compares recovered types with a generated, build-time vocabulary.
An unknown stored event is accepted only when its own envelope explicitly
carries `ignorable: true`. Absence means required and recovery refuses the
whole Session. Mark only a purely informational record whose omission cannot
change reconstruction or plugin-owned authority; a reader never infers this
property from the event being external.

`SurfaceEventType` is the closed core set `user/message`,
`assistant/message`, and `tool/result`. An event type added to a matching
Harness build is log-only unless that build also deliberately changes the
surface contract; type augmentation alone cannot give it `surfaceOp`. If a
fact must affect the model, let an owner-controlled surface producer or
prompt/context contribution derive a core model-visible value deliberately.
Never inject a record into model history merely because it is persisted.

Declaration merging alone does not add an external type to
`KNOWN_SESSION_EVENT_TYPES`. In this pinned API, ordinary `Session.append()`
also exposes no `ignorable` option for log-only events, so a custom event
written through that path is required-on-read and is not portable to a stock
recovery build. An external writer/seed path may retain a custom informational
event only when it deliberately persists `ignorable: true` and tests cold
recovery without the plugin. Otherwise use a semantically correct existing
Session event, a Cordis live event for process-only coordination, or
plugin-owned versioned storage.

If a custom event is required for reconstruction, affects model history, or
cannot truthfully be skipped, integrate it into the Harness source tree or a
deliberately maintained source overlay, regenerate the persistence
catalog/known-event module, rebuild and distribute that matching Harness
runtime, and own its format/version migration. Every runtime build that may
recover those logs must contain the generated catalog entry. Compose the
event's validation/invariants and the relevant projection, query, migration,
or UI readers on the paths that actually interpret the fact. Readers should
retain a default branch, and persisted types must not be removed or renamed
without a format/version and migration decision.

Projections are pure, synchronous folds producing complete JSON values. Return
the same state reference when an unrelated event leaves state unchanged, and
reuse an object-valued `view` reference across internal-only state changes: the
pinned change feed republishes a unit only when its raw `view` result changes
by `Object.is`. A client consumes projection snapshots; it does not
reimplement the domain fold.

Canonical reading:

- `docs/event-producer-consumer.md`
- `docs/subsystems/session.md`
- `docs/subsystems/persistence.md`
- `docs/subsystems/session-projection.md`
- `docs/persistence-catalog.md`
- `packages/core/session/src/index.ts`

## Public boundaries

- Validate and normalize at the boundary that owns the decision.
- Pass exact authority objects such as the live `Agent` where identity grants
  permission; do not replace authority with a caller-supplied id.
- Use stable machine-readable error codes and bounded diagnostics.
- Preserve caller cancellation through parsing, transport, provider, and
  subprocess layers.
- Contain observer, logging, and best-effort callback failures so they cannot
  roll back an already committed domain operation.
- Scrub credentials from subprocess environments, logs, events, and errors.
- Fail closed when configuration, persistence format, sandbox policy, or
  permission state is unknown.

## Baseline tests

Every contribution needs focused unit coverage and an HMR/removal test. Any
model-visible, user-visible, durable, or externally observable behavior also
needs a real Loader or application/profile composition test. Mock only external
services and nondeterministic inputs; assert the external world rather than the
mock's call history alone.

Read `docs/testing.md` and the task-specific testing section before choosing the
test boundary.
