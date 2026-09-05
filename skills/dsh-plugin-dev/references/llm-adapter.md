# LLM Adapters

Read this reference when implementing a model provider, stream parser, model
catalog, routing, retry behavior, usage accounting, or provider configuration.

For alpha.1, apply the assistant-stream, file projection and process-proxy
deltas in [version-specific contracts](version-contracts.md). In particular,
embedded settlement streams do not authorize adapter-owned model retries.

## Adapter boundary

An adapter converts immutable Harness `GenerateOptions` into one semantic
provider attempt and yields normalized `StreamChunk` values. That attempt may
contain bounded protocol-owned auxiliary requests such as file upload or stale
handle repair; it must not hide a second model attempt. The adapter owns
provider transport, credentials, request serialization, streaming parse,
stable provider errors, and exact model metadata. It does not own agent-loop
policy or silently reroute unknown provider/model identities.

Canonical reading:

- `docs/user/develop/practice/llm-adapter.md`
- `docs/subsystems/llm-streaming.md`
- `docs/deepseek-llm-api-wire-extensions.md`
- `packages/llm/llm-deepseek/`

## Minimal shape

Follow the current `LlmAdapter` Definition in the pinned source rather than
copying a stale signature. A namespace plugin commonly injects `llm`, creates
one adapter instance, and registers all routes as one lifecycle-owned effect.

The adapter must:

- expose exact provider and model identities;
- reject unsupported options instead of silently dropping them;
- preserve immutable messages and request metadata;
- use current credentials for each request;
- attach Harness attribution headers to every HTTP request;
- pass the caller signal into fetch/stream parsing;
- produce only valid normalized chunks;
- remove all routes atomically on disposal.

One adapter `stream()` call is exactly one provider attempt. Disable SDK or
HTTP-library automatic retries (`maxRetries: 0` or its equivalent). Agent-level
recovery owns visible retry attempts and durable turn numbering; direct
`ctx.llm.stream()` callers remain single-attempt. A provider retry-after value
is failure metadata, not permission for the adapter to retry internally.

## Stream protocol

Treat stream chunks as a state machine. Enforce these invariants:

- text/reasoning/tool deltas preserve provider order;
- block start/end events are balanced;
- tool-call indices are assigned by first appearance and remain stable;
- streamed tool arguments stay raw JSON deltas until the protocol's assembly
  point;
- usage appears before the terminal finish chunk;
- exactly one terminal state is emitted;
- no chunk is emitted after `finish`, error terminal, or abort;
- EOF without a valid provider terminator is a closed-stream error, not an
  implicit success;
- cancellation interrupts both network reads and parser waits.

Do not mutate the input request or previously emitted chunk objects.

## Model catalog and routing

The model catalog describes available identities, modalities, context limits,
reasoning support, and pricing hints. It is not automatically a hard allowlist
for routing unless the Definition says so. `resolveModel` returns the exact
provider/model pair and correct capability metadata.

Make provider selection explicit. Duplicate or ambiguous routes fail loudly.
Adapter registration and replacement are atomic so one provider cannot leave a
half-updated route set.

If native follow-up needs provider response ids, signatures, or other metadata,
emit a lossless `ReplayEnvelope`: opaque response-level data plus optional
per-block entries aligned one-for-one with emitted content blocks. Assembly
prunes block metadata whenever it prunes the corresponding block, so never
store an independent list that can drift from content.

`LlmRuntime` passes stored replay state only when the historical provider route
and target provider route are currently owned by the exact same adapter
instance. The adapter must validate the envelope and decide whether same-model,
cross-model, or cross-provider reuse is legal. Never infer private replay state
from provider/model strings, and degrade unusable stored state to the durable
provider-neutral content rather than corrupting or rejecting that history.

On HMR, reuse the same adapter instance only when the replacement contract
intentionally preserves that identity and its validated state.

## Credentials and dynamic settings

Resolve credential references through the credential service for every request;
do not copy secrets into configuration dumps, Session events, errors, or model
metadata. Dynamic settings should replace one validated whole connection
snapshot. If a candidate fails beyond-schema validation, retain the complete
last-good snapshot rather than mixing old and new fields.

Separate provider selection from credential presence. Local catalog discovery
must not make a network call or expose a secret.

## Errors and termination

Use stable `LlmError` categories for provider, authentication, throttling,
invalid response, timeout, stream closure, unsupported request, and transport
failure according to the current Definition. Preserve provider diagnostics only
within bounded, scrubbed details.

Distinguish:

- a thrown setup/transport failure before a usable stream;
- an in-band terminal provider error after streaming began;
- caller abort;
- idle timeout;
- malformed or prematurely closed stream.

Retries must not duplicate already committed visible output. The adapter does
not retry; the owning recovery layer closes the failed attempt and deliberately
starts another one. Attempt events, backoff, cancellation, and retry policy
remain explicit and registration-bound.

## Usage and pricing

Emit the provider's normalized usage before `finish`. Do not synthesize exact
token counts from string length. Route-specific pricing belongs to a detached
pricing snapshot and token-meter calculation, not to UI rendering.

## Required tests

- serialization of every supported option and rejection of unsupported ones;
- model identity, modalities, context window, reasoning metadata, and routing;
- attribution and authorization headers without leaking values;
- fragmented SSE/stream boundaries and multibyte input;
- balanced blocks, stable tool indices, raw argument deltas;
- usage-before-finish and no-output-after-terminal;
- EOF, malformed frames, provider terminal error, idle timeout, and abort;
- cancellation reaches fetch and stream readers and leaves no callbacks;
- one adapter call forms one semantic provider attempt with SDK/library model
  retries disabled; protocol-owned auxiliary requests remain bounded,
  cancellation-aware, and explicitly tested;
- atomic registration/replacement and HMR removal;
- replay envelopes stay block-aligned and are withheld across adapter-instance
  boundaries;
- dynamic whole-snapshot validation and last-good retention;
- real Loader composition with no real credential where possible;
- a key-gated real provider test for the actual protocol when credentials are
  available.

Use `packages/llm/llm-deepseek/tests/sse.spec.ts` for parser edge cases,
`adapter.spec.ts` for the contract, `loader-composition.spec.ts` for real
composition, and `adapter.e2e.ts` for credential-gated protocol evidence.
