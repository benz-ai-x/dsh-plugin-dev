# Tool Plugins

Read this reference when adding or changing a model-facing DSH tool, its
execution policy, canonical result, or UI presentation.

## Package and activation contract

A tool consumer normally namespace-exports `name`, `inject`, optional `Config`,
and `apply` without a default export. Inject `tools` plus every hard service the
tool uses:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-example'
export const inject = ['tools']

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'example',
    description: 'Return one normalized example value.',
    parameters: {
      input: { type: 'string', required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          value: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.value }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw exec.signal.reason
      return { value: args.input.trim() }
    },
  }))
}
```

`run_code` is reserved by the Tool registry as the PTC transport. Never
register or generate a business tool with that name; choose a domain-specific
snake_case identity.

Treat the parameter and output DSL as runtime contracts. The shorthand
`parameters` map has an implicit open object root; extra root arguments remain
accepted. Every explicit nested object node must deliberately declare
`additionalProperties: true` or `false`. Output object schemas should normally
use `false` when the logged/model-visible canonical value must equal the
declared object exactly. A raw JSON Schema registration owns its complete input
validation. Validate constraints the schema cannot express before committing
state.

Canonical examples:

- `docs/user/develop/basic/tool.md`
- `docs/cookbook/adding-a-tool.md` — the authoritative execute/presentation contract
- `docs/cookbook/extension-cookbook.md` — extension-point selection patterns
- `docs/subsystems/tools.md`
- `docs/tool-execution-pipeline.md`
- `packages/todo/tool-todo/src/index.ts`
- `packages/jobs/tool-jobs/src/index.ts`

## Canonical value versus presentation

`execute` returns the canonical JSON value. The output schema validates and
freezes that value. `output.render` converts it to model-visible content.

Keep these concerns separate:

- canonical value: stable programmatic result for policy, tests, PTC, and
  in-process callers;
- rendered content: bounded model-facing blocks;
- call/result presentation: pure, replayable UI metadata;
- durable Session result: content/error/meta owned by the tool pipeline, not an
  arbitrary duplicate of execution-local objects.

Do not stringify JSON inside `execute` merely because the current model display
needs text. Do not let a renderer make domain decisions or access mutable
runtime services.

Host `presentCall`/`presentResult` helpers do not create a specialized built-in
Web card. Session transport carries the raw call/result and persisted metadata;
a Client plugin registers the wire tool name in the keyed
`tool.call.toolview` Slot, validates those wire values, and derives ordinary
component props. Use bounded `presentationMeta` only for replayable facts that
model-visible content cannot preserve; never store React props or a selected
card in it.

Return a typed canonical outcome for expected domain states such as `notFound`,
`denied`, or `conflict` when callers can act on them. Throw for invalid input
that escaped schema validation, broken invariants, provider failure, transport
failure, or another infrastructure condition.

## Identity and authority

The executor owns `callId`, caller `agent`, signal, inherited restrictions, and
execution metadata. A wrapper or nested call must preserve those identities.
Never accept a model-supplied Session or Agent id as a substitute for
`exec.agent` when the operation needs caller authority.

If the operation has no valid non-Agent meaning, reject an invocation without
`exec.agent` rather than silently writing global state.

A tool may notify through `exec.agent.inject({ content, source: { kind: 'plugin',
plugin: '<name>' } })`: the content is durable and the NEXT model request sees
it — it is not a wake-up, and an idle agent stays idle. Guard the call against
an already disposed agent.

## Cancellation and ownership

Pass `exec.signal` through every provider, network request, child tool,
subprocess, parser, and wait. A cancellation result is not complete until owned
callbacks and streams are quiet.

When the call creates durable background work through `ctx.jobs`, define the
publication point. Before publication, caller cancellation rolls it back. After
publication, the job registry owns cancellation and the tool returns the job
identity instead of retaining hidden work.

## Concurrency and restrictions

Tools are exclusive by default. Opt into concurrency only for an operation that
is explicitly safe, independent, and free of hidden shared mutation. A true
concurrency flag is a contract, not a performance guess.

Inherited tool restrictions intersect; nested policy may narrow but never
widen permissions. Enforce denial inside the executor or guard that all call
paths traverse. Schema omission, prompt text, UI hiding, and listener order are
not enforcement.

Use `ctx.tools.guard` only for monotonic policy. A guard may deny or narrow; it
must not replace identity or elevate authority.

Choose among the five extension points by intent: `tools/pre-execute` for
extensible allow/deny/ask policy, `ctx.tools.guard()` for a final monotonic
denial later listeners cannot undo, `tools/execute` to wrap the dispatch
lifetime (deadline, retry, metrics — the only place a wrapper may replace and
restore the required `exec.signal`; it cannot remove it), `tools/post-execute`
to transform or block the result, and `tools/result` for contained observation
of the immutable outcome.

A registered definition is borrowed read-only: never mutate its schema or
callbacks after registration. Hot-swap by disposing the owning effect and
registering the replacement.

## Session effects

If a tool writes a durable event:

1. validate the full candidate value;
2. establish exact caller/session authority;
3. append the event;
4. flush when success must survive a process crash;
5. return the committed canonical result;
6. let projections and subscribers derive their views.

Do not mutate an object after append. Do not add coordination events to the
conversation surface unless the model must actually receive them as history.
On the stock pinned Harness, declaration merging alone does not make a custom
event known to persistence. An unknown stored record survives cold recovery
only with an explicit `ignorable: true` envelope and may then be purely
informational; absent means required and recovery refuses it. The pinned
`Session.append()` API does not expose that marker for log-only events, so a
normal custom append is not a portable persistence route. Required custom
facts need plugin-owned versioned storage or a matching rebuilt Harness as
described in `core-contracts.md`.

## Programmatic tool calling

PTC may execute nested tools without re-entering model history for every
subcall. Nested calls still receive start/end logging, policy, schema,
cancellation, and canonical results. Keep results programmatically useful and
do not depend on a human-oriented text renderer as the only contract.

## Required tests

- schema advertises the exact model contract;
- the implicit root's open behavior and every explicit nested object's chosen
  `additionalProperties` policy are tested;
- valid input returns a schema-valid canonical value and expected rendering;
- malformed and beyond-schema input fails before state changes;
- authority and inherited restrictions are enforced at execution;
- cancellation reaches the underlying operation and teardown becomes quiet;
- a domain rejection does not masquerade as infrastructure success or vice
  versa;
- durable events contain detached complete snapshots;
- disposing the plugin removes its tools and optional projections;
- a real `cordis.yml` Loader test proves configuration controls behavior;
- one full agent-loop or profile test proves the model-visible/durable outcome.

Use `packages/todo/tool-todo/tests/loader-composition.spec.ts` as the smallest
canonical Loader/config example and `packages/todo/tool-todo/tests/integration.spec.ts`
as the full-loop reference.
