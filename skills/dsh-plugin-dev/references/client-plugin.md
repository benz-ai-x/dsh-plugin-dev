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
- `docs/api-gateway.md`
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

Mount generated Remote contributions explicitly with `$mount`, then compose UI
only after the named Remote service becomes available. If UI mounting fails,
dispose the partial UI and the Remote contribution. On unload, dispose both in
the reverse ownership order.

Separate transport and domain results. A successful RPC may contain a typed
domain rejection such as a stale revision; a disconnected transport is a
different outer failure.

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

- package manifest exposes a built `./client` entry and valid `dsh.client`;
- Client dependency discovery and load order;
- Remote contribution mount, partial-failure rollback, and unmount;
- Slot registration appears and disappears with the Client Fiber;
- projection loading/absent/value/replacement behavior;
- stale revision and transport failure render differently;
- rapid duplicate actions are fenced before the next React render;
- entity replacement resets transient drafts;
- component tests receive ordinary props without Context;
- reconnect/resume obtains the current whole snapshot;
- packed browser entry imports without Host-only dependencies.

Use `packages/client/ui-goal` as the small canonical projection/Slot example and
`packages/experimental/client-ui-agent-team` for Remote mount plus UI lifecycle.
