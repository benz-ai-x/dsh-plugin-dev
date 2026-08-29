# Service Plugins

Read this reference when designing a capability seam, Service Definition,
provider, consumer, registry, or replaceable runtime.

## Decide whether a service seam is warranted

Create a seam when two or more providers, consumers, or independent release
cycles need a stable boundary. Do not introduce a public Service to hide a
private helper with one caller. Pass a private capability closure instead.

When a seam is real, separate roles conceptually:

- Definition: the provider-independent vocabulary and API;
- Provider: one implementation and its configuration/resources;
- Consumer: a tool, API, UI bridge, or workflow that uses the definition.

Providers and consumers depend on the Definition. A Definition must reflect all
current consumers, not leak the first provider's transport or one UI's needs.

Canonical reading:

- `docs/capability-seams.md`
- `docs/user/develop/practice/index.md`
- `docs/subsystems/core.md`
- `docs/module-graph.md`

## Definition shape

Use module augmentation to add the service to Cordis Context and publish it
through `Service`:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export interface RunRequest {
  readonly input: string
  readonly signal: AbortSignal
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    example: ExampleService
  }
}

export abstract class ExampleService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'example')
  }

  abstract run(request: RunRequest): Promise<Readonly<{ value: string }>>
}

export default ExampleService
```

Keep requests immutable, explicit, and provider-neutral. Put cancellation and
exact authority-bearing objects in the contract when they materially govern
the operation. Avoid unbounded `Record<string, unknown>` escape hatches.

## Provider behavior

A concrete provider subclasses the Definition or publishes the same stable
service key. It owns transport, credentials, resource limits, retries, and
shutdown. Configuration must validate before the provider becomes observable.

When the provider is the module's default export, put Loader metadata on that
class. Named sibling metadata is discarded when Loader unwraps the default:

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import ExampleService from 'dsh-example-definition'

export interface Config {
  timeoutMs: number
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().min(1).default(30_000),
})

export default class ExampleProvider extends ExampleService {
  static inject = ['credentials']
  static Config = Config

  constructor(ctx: Context, readonly config: Config) {
    super(ctx)
  }

  // implement the Definition's provider-neutral API
}
```

Use either this class-plugin form or a namespace plugin with named
`name`/`inject`/`Config`/`apply`. A namespace wrapper can mount a provider when
it owns additional sibling effects, but it must also own their rollback and
must not add a default export.

Publish a provider atomically. If registration consists of multiple routes or
capabilities, either all become visible or none do. On replacement, retain a
minimal lossless replay/configuration state only when the seam promises it.

Availability checks must be local and side-effect free. Do not perform network
requests merely to decide whether a provider appears in a catalog.

## Consumer behavior

Declare required services in `inject` and use the Definition's public API.
Never import provider-specific runtime values into a consumer. Keep provider
selection explicit where more than one provider can satisfy an operation;
report ambiguity instead of relying on registration order.

When the entire consumer is optional, mount it through a child injection scope:

```ts
ctx.inject(['optionalCapability'], scoped => {
  scoped.someRegistry.register(/* contribution */)
})
```

For a single optional read outside that lifecycle, use `ctx.get()` and handle
absence explicitly.

## Registries

Registry snapshots returned to callers should be detached, immutable, and
deterministically ordered. Registration must return or own a disposer. Reject
duplicate keys unless replacement semantics are explicitly part of the
contract.

For a provider registry:

- define exact identity and collision rules;
- make selection deterministic;
- avoid turning a catalog hint into a hard routing allowlist unless specified;
- remove all routes when the provider unloads;
- keep lookup errors stable and machine-readable.

## Events and callbacks

Use events for observation and extension only where a direct service call is
not the clearer contract. Decide whether an event is broadcast, bail, serial,
parallel, or waterfall. An observation-only waterfall listener must call
`next()` and return its result; swallowing the continuation changes behavior.

Contain observer failures after commit. Before-commit policy hooks may fail the
operation only when the contract explicitly grants them that authority.

## Error contract

Use stable error codes for absence, ambiguity, invalid configuration,
unsupported operation, conflict, cancellation, and provider failure. Preserve
the original cause internally without exposing secrets or provider payloads.

Do not collapse these distinct states:

- capability absent;
- capability present but operation unsupported;
- policy denial;
- valid domain rejection;
- provider/transport failure;
- caller cancellation;
- runtime disposal.

## Required tests

- Definition types compile for at least one real consumer and provider;
- provider registration and duplicate/replacement semantics;
- consumer waits for required services and unloads when one disappears;
- optional behavior appears/disappears without crashing the parent plugin;
- configuration fails during load before publication;
- requests and returned snapshots cannot be mutated across the boundary;
- cancellation and provider disposal reach quiescence;
- registration is removed after Fiber disposal;
- real Loader composition selects the intended provider and reports ambiguity;
- a product-level test asserts the consumer's external outcome.

Canonical small Definition reference:
`packages/context/file-reference/src/index.ts`. Registry and replaceable
provider references include `packages/web/web/src/index.ts`,
`packages/lsp/lsp/src/index.ts`, and `packages/llm/llm/src/index.ts`.
