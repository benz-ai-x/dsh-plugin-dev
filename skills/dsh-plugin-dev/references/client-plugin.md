# Client UI Plugins

Read this reference when a DSH extension adds Web UI, browser state, a Remote
API, a renderer, or a Slot contribution.

## Host and Client boundary

The Host owns domain truth, durable state, permissions, and external effects.
The browser receives an explicit transport projection of that truth and invokes
explicit Remote operations. It does not import Host runtime values or recreate
the domain state machine.

The normal flow is:

```text
Host truth -> transport/Remote -> Client model -> UI adapter -> Slot -> React
```

Use type-only imports or dedicated browser-safe exports for shared types. Do not
bundle Node libraries, credentials, persistence implementations, or Host
services into the Client build.

Canonical reading:

- `docs/subsystems/client-modules.md`
- `docs/subsystems/web-client.md`
- `docs/subsystems/slots.md`
- `docs/subsystems/session-projection.md`
- `docs/subsystems/conversation.md`
- `docs/api-gateway.md`
- `docs/cookbook/adding-a-remote-api.md`
- `docs/cookbook/adding-a-settings-card.md`
- `packages/client/ui-goal/`

## Package manifest

Expose a browser entry and declare its Client dependencies:

```json
{
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./client": {
      "types": "./lib/types/client/index.d.ts",
      "default": "./lib/client.js"
    }
  },
  "dsh": {
    "client": {
      "inject": [
        "@deepseek-ai/dsh-api-remotes",
        "@deepseek-ai/dsh-client-ui-renderer"
      ],
      "platform": "web"
    }
  }
}
```

The Host entry may be an empty named `apply` when the package exists only to
make its browser half discoverable. Keep the namespace export rule: no stray
default `apply`.

External Client packages must ship built JavaScript, declarations, CSS, and any
assets listed by their exports. Test package discovery from the packed artifact;
source aliases can hide missing `./client` files.

The browser loader consumes DSH's lazy-CJS bundle protocol, not an arbitrary ESM
browser entry. The pinned monorepo's `clientBundle()` tsdown helper is internal
build infrastructure, not a published external-project preset. Until an
official preset is published, an external Client package must supply and test a
compatible factory bundle deliberately; copying a monorepo-relative build
import is not a distributable solution.

## Slots instead of cross-feature imports

A feature contributes UI through `ctx.slots`. It must not runtime-import
another feature's React component or reach into another feature's private
store. The Slot owner defines the component contract and keyed data map; the
contributor supplies a component and a small injected face.

Do not pass Cordis Context or a transport object into React components. Create
business callbacks and standard hooks in the adapter, then pass ordinary typed
props into the component.

For a Slot contribution:

- wait for the owning Slot through `ctx.slots.inject`;
- choose a stable entry id/key and deterministic order;
- register locale and renderer dependencies in the same lifecycle;
- ensure disposal removes the entry;
- use the owner-provided session/projection hooks instead of a feature-global
  subscription.

## State and projections

Use Host-computed Session projections for durable session-derived state. A
projection publishes a complete value with an `asOfSeq`/version fence; the
Client replaces its mirror rather than applying a second domain fold.

A Host reader that directly accesses `ctx.sessionProjections` must declare
`sessionProjections` in its required `inject` metadata and fail composition
explicitly when the provider is absent. A contributor whose feature is
genuinely optional may scope registration through `ctx.inject` so it appears
and disappears with the optional provider. Do not use an undeclared direct
property read as accidental optionality.

Choose the two similarly named extension points by output shape:

- A Host Session projection (`ProjectionDefinition` plus
  `SessionProjectionMap`) is a pure fold that publishes a whole current
  business value and may be cached or served without replaying the UI. Keep
  `view` outputs reference-stable: the change feed notifies only when the raw
  view result changes by `Object.is`, so a fresh object per call republishes
  on every internal-only state change.
- `ConversationNodeDefinition` is a Client-side event-to-node state machine for
  transcript or trajectory rows. It derives presentation from transported
  Session records and is not the authority for the domain snapshot. Conversation
  targets activate lazily: creating or reading a target source does not activate
  it — the first source subscription (or the shell's explicit View selection)
  does, and unsubscription does not deactivate one.

Do not implement one as a substitute for the other. A feature may use both: a
whole projection for current controls/status and a Conversation Definition for
historical rows.

Represent these states distinctly when the UI needs them:

- capability not composed or still loading (`undefined`);
- capability present with no current value (`null`);
- current value;
- transport disconnected/stale;
- mutation pending;
- domain conflict/rejection;
- transport failure.

Local component state is appropriate for transient drafts, open panels, and
pending interaction locks. Reset it when the authoritative entity identity
changes so a stale draft cannot overwrite a replacement object.

## Remote APIs

Use concrete Typert Remote services and generated descriptors. Define named
arguments and browser-safe codecs. Keep the final `AbortSignal` out of wire
arguments and carry it through the transport as cancellation.

A business Remote package exposes generated Host reflection and Client
contribution faces through `./typert` and `./remote` respectively (plus
`./client` only when it also has browser UI). Generate/build the Host Typert
contract before compiling the Client face; a Client-only rebuild cannot infer
new Host decorators. The Client composition owner mounts selected `./remote`
contributions rather than making business components load the Gateway.

Mount generated Remote contributions explicitly with `$mount`, then compose UI
only after the named Remote service becomes available. If UI mounting fails,
dispose the partial UI and the Remote contribution. On unload, dispose both in
the reverse ownership order. A Client caller declares both `remote` and
`remote.<namespace>` in its `inject` and calls `ctx.remote.<ns>.<method>()`
directly — no hand-written method signature or relay object. Fixed Host facts
are plain reads on `ctx.remote.$host` (`home` is `undefined` until the first
ready frame); refresh them after a reconnect through `ctx.on('connection/reset')`
or a domain Remote event.

The pinned Remote contract uses one shared `RemoteError` class and a
declaration-mergeable `RemoteErrorDetailsMap`. Owners declare stable
`<domain>/<reason>` codes beside their browser-safe detail types and throw
`RemoteError` at the failure point. Discriminate by `error.code`, not
`instanceof`, because the structural marker survives bundle/realm copies.

Every generated unary method resolves to `RemoteResult<T>`. Both Host/domain
Remote failures and carrier failures such as disconnect/cancellation occupy
its `{ ok: false, error: RemoteError }` branch; only local assembly faults such
as an unmounted method, invalid generated arity, or missing Context adapter
reject the Promise. A successful value may still carry a domain outcome union
when that outcome is part of normal business data, but callers must not wrap
every unary invocation in `try/catch` to recover transport failure.

For the pinned source, Typert descriptors and the Gateway implementation also
support `@Remote({ mode: 'stream' })`/`mode: 'stream'`. The older unary-only
boundary prose in `docs/api-gateway.md` is stale relative to
`docs/subsystems/typert.md` and the implementation. Treat the pinned source as
authoritative.

Keep the two stream layers distinct. A generated stream method opens one
logical stream and returns its `AsyncIterable`; a terminal Host or transport
failure escapes as the shared `RemoteError`. Physical carrier failures used by
the reconnect supervisor remain internal and are only reported through its
carrier-failure callback. The decorator layer does not reconnect or infer
replay. When a domain needs continuity across physical carrier generations,
supervise a new opening per generation with `ctx.remote.$stream()`. The domain
must validate and accept each opening value, own the resume cursor or
replacement baseline, and classify whether normal completion is terminal or
reconnectable.
`RemoteSnapshotStream` supplies the snapshot-then-deltas pattern;
`RemoteJournalStream` supplies follow-before-page, catch-up, duplicate removal,
and gap repair for domain-defined journal ranges. Test only the layer the
feature actually uses.

Canonical references:

- `docs/subsystems/typert.md`
- `packages/api/gateway/`
- `packages/experimental/client-ui-agent-team/src/client/mount.ts`
- `packages/client/ui-goal/src/client/index.ts`

## Rendering and presentation

Renderers and presentation functions must be pure, bounded, replayable, and
safe for historical values. They receive snapshots or canonical data, not live
service objects. Keep model-facing tool rendering distinct from browser cards.

Use CSS Modules, shared primitives, and theme tokens. Do not hardcode global
class names or assume a specific theme background. Register localized copy
under a namespace owned by the feature.

## Required tests

Apply only the groups matching the package shape; do not create unused exports
or services merely to satisfy this list. An ordinary UI package runs the UI
group, a Remote-only contributor runs the Remote group and does not need
`./client` or `dsh.client`, and a UI-plus-Remote package runs both.

UI package tests:

- the manifest exposes a built `./client` entry and valid `dsh.client`;
- Client dependency discovery and load order are correct;
- Slot registration appears and disappears with the Client Fiber;
- component tests receive ordinary props without Context;
- the packed browser entry imports without Host-only dependencies.

Remote contributor tests:

- Host-first Typert generation produces packed `./typert` and `./remote`
  exports;
- contribution mount, partial-failure rollback, and unmount work;
- unary success and the `RemoteResult` error branch are handled without
  treating carrier outcomes as Promise rejection;
- owner-side assertions recover the thrown failure with `remoteErrorOf` and
  compare `code`/`details` with `toMatchObject` — never `toEqual` on the error
  object, never `instanceof`;
- declared domain codes narrow their matching `details`, while unknown/newer
  codes remain readable as Remote failures.

Add the applicable feature-specific tests:

- a Session projection covers loading, absent, value, and whole-value
  replacement;
- a Conversation Definition keeps stable `(kind, id)` keys and equivalent
  state across packed records, page/prepend/replace windows, and live append
  without rescanning retained history;
- mutating UI distinguishes stale revision from transport failure, fences rapid
  duplicate actions before the next React render, and resets transient drafts
  on entity replacement;
- a direct generated stream validates items, propagates cancellation and
  carrier termination, and becomes quiet on disposal;
- a reconnecting stream validates every generation opening, owns its resume
  cursor or replacement baseline and normal-end classification, obtains the
  current whole snapshot when required, and never duplicates accepted items.

Use `packages/client/ui-goal` as the small canonical projection/Slot example,
`packages/session/session-turn-outline` as the whole-log projection with
`./types` and `./client` subpath exports, and
`packages/experimental/client-ui-agent-team` for Remote mount plus UI lifecycle.
