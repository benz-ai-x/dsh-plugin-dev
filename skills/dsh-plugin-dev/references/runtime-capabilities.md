# Runtime Capabilities

Read this reference when a DSH plugin crosses filesystem, subprocess/job,
sandbox/approval, Session persistence, or subagent boundaries. Load only the
upstream subsystem documents for the capabilities actually used.

Resolve [version-specific contracts](version-contracts.md) first. The Session
storage description below is alpha.4; alpha.1 requires its handle, generation,
and historical-extension rules. Its transport/file deltas also apply only when
those capabilities are used.

## Filesystem

Use `ctx.fs`, not direct Node filesystem calls, when the capability must follow
the composed DSH execution world. Resolve a supplied path to `FsTarget` and
treat `targetKey` and `FsVersion` as opaque provider values. Use provider
methods such as `processPath()`, `fileUrl()`, and `contains()` instead of
parsing those identities.

Pass cancellation into every supported operation and bound retained content.
For mutation safety, preserve the observation policy's read-before-write/edit
flow and opaque version guards. Sandbox denial, host permission denial,
not-observed, not-found, and stale-version are distinct stable failures. Local
file I/O is only best-effort abortable; do not advertise a timeout that cannot
stop an in-progress syscall.

Read `docs/subsystems/filesystem.md` and, when process paths cross the same
execution world, `docs/subsystems/subprocess.md`.

## Subprocesses and background jobs

Use `ctx.subprocess` with a fully specified argv array, cwd, stdio, limits,
environment overrides, grace period, and signal. The seam never invokes a
shell; a deliberate shell command is itself argv such as
`['bash', '-c', command]`. Start from the provider's scrubbed environment and
opt credentials or `DSH_*` facts in explicitly. Never log the effective
environment.

Await tree/session quiescence during teardown. The caller owns deadlines and
cause classification; the subprocess seam reports exit facts. When work is
published to `ctx.jobs`, the registry becomes the lifecycle/identity owner:
return the job id, make cancellation idempotent, and make `done` settle only
after resources are released. Agent-owned jobs are cancelled and awaited when
that exact owner disposes; unowned jobs remain open until explicit/service
cleanup.

Read `docs/subsystems/subprocess.md`, `docs/subsystems/jobs.md`, and the exact
consumer (`shell.md`, terminal, LSP, or ACP) involved.

## Sandbox and approval

Keep these as independent axes:

- sandbox policy constrains filesystem effects for one call;
- approval decides whether one exact proposed action may proceed.

An approval grant does not disable sandbox enforcement, and confinement is not
user consent. Resolve sandbox policy per call. `danger-full-access` bypasses
the confinement provider; confined modes must fail closed if no enforcing
runner is available. `partial` enforcement is a reported fact that a consumer
requiring the full promise must reject or expose.

Sandbox mode does not govern network access or process visibility. Model those
through their owning capability/policy rather than implying that
`workspace-write` blocks the network. Approval is also fail-closed:
`allowed-once` is the only grant; rejected, cancelled, unavailable, missing,
throwing, or malformed answerers deny. Never cache one grant for a different
call.

Read `docs/subsystems/sandbox.md`, `docs/subsystems/approval.md`, and the
enforcing consumer's contract.

## Session facts and persistence

Append complete lossless-JSON facts and treat the returned snapshot as the
committed in-memory value. Only `user/message`, `assistant/message`, and
`tool/result` are surface events.

The pinned persistence runtime compares recovered types with its generated
`KNOWN_SESSION_EVENT_TYPES` and has no runtime registration surface for
out-of-repo declarations. It does retain an unknown record whose stored
envelope explicitly carries `ignorable: true`; absent means required and cold
load refuses the Session. Use that marker only for information whose loss
cannot change reconstruction. Declaration merging and Loader composition do
not set it, and this pinned `Session.append()` surface exposes no log-only
`ignorable` option, so an ordinary custom append is still not portable across
stock recovery. Use an existing event only when its semantics genuinely match,
a Cordis live event for process coordination, or plugin-owned versioned
persistence. A required custom vocabulary needs in-tree integration or a
maintained Harness source overlay, a regenerated persistence catalog, the
matching rebuilt Harness, and a format/migration plan. It remains log-only
unless that matching build also changes the closed surface contract.

The shipped `SessionPersistence` provider is JSONL, one artifact per Session.
An out-of-tree backend implementing the same service contract is a supported
route, but it owns the equivalent direction-aware format refusal
(`SessionFormatUnsupportedError`, never "corrupt" for a foreign version) at its
own physical boundary.

`Session.append()` is the in-memory acceptance/publication boundary, not proof
of durable storage. Await `ctx.sessions.flush(session)` when success must
survive a crash before reporting success or transferring ownership. Treat
listener notifications as post-commit observation and contain their failures.
Projections are pure synchronous whole-value folds; return the same state
reference for unrelated events, reuse an object-valued `view` reference across
internal-only state changes (the change feed republishes only when the raw
`view` result changes by `Object.is`), and bump persisted state versions when
fold semantics or serialized state changes.

Read `docs/subsystems/session.md`, `docs/subsystems/persistence.md`,
`docs/subsystems/session-projection.md`, and the generated
`docs/persistence-catalog.md`.

## Subagents

Pass the exact live `Agent` object wherever the seam uses it as an authority
credential. Session ids, source metadata, labels, and claimed lineage are not
substitutes. Follow-up authority is the exact live direct parent; interrupt
authority is the defined direct-parent address or exact live ancestor object.

Visibility is not inheritance. In-process children receive a new flat scope;
forking completed conversation history does not imply inherited tools,
services, sandbox policy, approval, credentials, or authority. Install desired
child capabilities explicitly and lifecycle-own the installation. Prompt image
parts are admitted and persisted through the attachment store before inbox
delivery, and the child's model must accept image input.

Before publication, caller cancellation owns preparation. After an accepted
run/message is published, the runtime/holder owns it independently. Always
await a one-shot run's result and dispose it; continuable activation teardown
closes admission, propagates cancellation top-down, flushes best-effort, and
releases child-first. External-process providers must scrub environment values,
credentials, tool inputs, file contents, and raw protocol payloads from logs
and bounded diagnostics.

Read `docs/subsystems/subagent.md` plus the selected provider and consumer
package documentation.

## Verification

Test the exact boundary used: opaque identity, schema/error codes, authority,
cancellation before and after ownership transfer, durability/flush behavior,
policy denial, disposal quiescence, and external-world effects. A mocked helper
call is not evidence that the composed provider, policy, and lifecycle agree.
