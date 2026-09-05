# Version-specific DSH contracts

Read the selected project's lock before using a version-specific API. A
channel name is not an API version: resolve its exact commit. The development
baseline is `0.1.2-rc.1` (`a66e4702047846cdaa10c66c9d3df3951f5ea70d`). It
retains the shared contracts audited at `0.1.2-alpha.4`
(`4e84901e6471b79ec0338099867ebb4606d12bb5`), with the storage/cache changes
below. Cordis/Loader/Tool contracts remain shared.

The later `0.1.3-alpha.1` (`d347e703908d0406b7a7ef80e3a0e594d86b2215`)
sections are retained only for historical analysis or a project explicitly
locked to that commit. Neither active channel selects it. Do not apply its
SessionHandle, format-v2, assistant-stream or Team changes to rc.1.

These are reviewed snapshots, not a future-version allowlist. For another
commit, rediscover exports, source and tests with the compatibility companion
before changing the audited channel; never extrapolate this delta to `>=0.1.3`.
Source verification does not authorize Registry delivery or imply that the
Service, Client, LLM or Team generators exist.

## Storage and projection-cache recovery — 0.1.2-rc.1

The alpha.4 → rc.1 review keeps 266 workspace packages, the same manifest
contracts apart from version fields, and all 17 official Skill resources.
The substantive changes are in storage-domain, storage-json and
session-projection-cache, with corresponding tool-cordis API documentation.
Session persistence, Agent creation, assistant chunks and Team messaging
retain their alpha.4 implementations; the later alpha.1 APIs below are absent.

`DomainSpec.compatibleVersions` projects onto `KvUnitDescriptor` and widens
JSON per-record reads plus the legacy whole-unit bootstrap. Entries must be
non-negative integers below the current domain version; writes always stamp
the current version. The single layout and SQLite backend remain strict.
Only declare an older version when current schemas genuinely accept its data.

`invalidRecords: 'backup-and-skip'` is an explicit policy for disposable
derived records, not authoritative data. It requires the backend's optional
`KvUnit.backupRecord`; otherwise invalid records still reject the whole open.
Global validation remains strict. The JSON implementation renames the record
to a `.json.bak.<YYYYMMDDHHmm>` path and logs the failure; a same-minute backup
of the same key can replace the prior backup. This is not a general backup or
data-migration guarantee.

`session_projcache` stays at domain version 5 and accepts versions 3 and 4.
Absent lineage fields normalize to `isSeeded: false` and
`inheritedEventCount: 0` when comparing identities. Old unseeded caches can
serve immediately; seeded identity mismatches still trigger cold rebuilding.
Keep per-row state-version and identity guards: storage readability alone
does not establish projection correctness. The legacy bootstrap admits only
accepted version stamps and leaves its source file unchanged.

Inspect `packages/storage/storage-domain/src/spec.ts`,
`packages/storage/storage-json/src/per-record-unit.ts`,
`packages/session/session-projection-cache/src/{spec,index}.ts`, and
`docs/subsystems/storage.md` in the exact rc.1 checkout. Test the two storage
packages and all projection-cache tests, including archived v3/v4/v5 and
lineageless-v5 fixtures, seeded refusal and invalid-record backup/skip.

Selecting rc.1 for development does not downgrade Session data written by
alpha.1's format-v2 runtime. Use isolated test homes/profiles; do not open,
rewrite or delete existing user Sessions as part of a baseline switch.

## Persistence and Agent lifecycle — historical 0.1.3-alpha.1

`SessionPersistence.create(header, options?)` returns a write `SessionHandle`;
`open(id, 'read' | 'write', options?)` returns an owned handle. Move backend
read/append/per-session flush/close operations onto that handle. Own one writer
per Session; a read handle does not acquire write ownership and cannot append
or flush. Close is idempotent, uncancellable, drains pending durability and
releases ownership; `Symbol.asyncDispose` delegates to it. Teardown must await
close even when the request signal is already aborted.

`SessionPersistence.flush()` remains the service-wide barrier for its active
write handles. `ctx.sessions.flush(session)` also **still exists** as the
high-level Session barrier: do not mechanically replace it with handle calls.
An acknowledged append is visible, not necessarily crash-durable. Flush before
reporting durability or transferring an obligation that must survive restart.

`stat` returns an optional `SessionPersistenceSnapshot`; `list` returns
snapshots, not bare headers. Treat `revision` as an opaque change token scoped
to one service instance and Session, not an ordered sequence. Event count and
byte size are optional hints, not substitutes for reading the log.

`agentLoop.create()` is asynchronous. Await it before using/publishing the
Agent. Agent-loop publication now owns persistence; setup-only, unpublished
Sessions must not leave durable residues. Resume repairs interrupted turns
under the writer handle. Read-only queries balance interrupted history in
memory without appending repairs to disk.

Inspect in the selected Harness:

- `packages/session/session-persistence/src/index.ts` and `src/handle.ts`;
- `packages/core/agent-loop/src/index.ts` (`create`, `resume`);
- `packages/core/session/src/index.ts` (`flush`);
- `packages/session-query/session-query/` and `docs/subsystems/persistence.md`.

Test competing writers, read-while-owned, cancelled preparation, unpublished
setup, close after cancellation, crash recovery, and no writes from queries.

## Format v2 and extension vocabulary — historical 0.1.3-alpha.1

JSONL storage uses immutable adjacent generations, not one physical file per
Session. `stat`/`list` inspect the highest canonical generation and translate
supported historical headers without reading or migrating the body. `open`
serializes migration per id through released v0 → v1 → v2, preserves every
source path/byte/inode, and exclusively publishes only the final generation.
A future highest generation refuses even if an older readable file remains.
Format refusal is `SessionFormatUnsupportedError`, not corruption.

Distinguish these boundaries:

- Current v2 recovery retains known extensions and unknown records explicitly
  marked `ignorable: true`; a required unknown event is refused.
- Historical v0/v1 migration refuses unknown types **even when ignorable**.
  Updating only the current generated vocabulary does not teach historical
  migration codecs about an old extension. Required custom events need an
  explicitly maintained historical migration as well as a matching runtime.

Declaration merging alone neither registers persisted vocabulary nor expands
the closed surface event set. Keep the alpha.4 external-event guidance scoped
to that build; do not promise that its custom logs upgrade automatically.

Use `packages/session/session-format-v0-to-v1/`,
`packages/session/session-format-v1-to-v2/`, and JSONL `tests/generation.spec.ts`
to test immutable migration, collisions, future refusal, torn tails, inherited
prefix remapping and unknown historical extensions.

`KvUnitDefinition.compatibleVersions` only widens per-record reads and legacy
whole-unit bootstrap; single-layout reads still require the exact version.
The owner must accept old fields in its schemas. A readable storage record
does not make an old projection checkpoint valid: retain the projection's
state-version/identity gates when its fold changes.

## Assistant settlement and Client streaming — historical 0.1.3-alpha.1

Persisted top-level `assistant/chunk` records are replaced by one settlement:
`assistant/message` carries `data.message` and **sibling `data.stream`**;
`assistant/attempt` carries `data.stream` when no surface message was committed.
Do not read `data.message.stream` or reconstruct the stream through the old
assistant `sourceEventSeqs`. Use `@deepseek-ai/dsh-llm/assistant-stream`;
`@deepseek-ai/dsh-session/chunk-rows` is no longer an export.

Session-controller transport distinguishes durable `type: 'event'` entries
from `type: 'transient'` entries carrying `assistant/live-chunk` plus attempt,
turn and step identity. Live chunks do not advance durable log cursors. Replace
the live attempt atomically when its persisted settlement arrives; do not
retain both rows or count usage twice. Reconnect, gap repair and historical
paging must converge on the same settled view.

Inspect `packages/core/session/src/types.ts`,
`packages/api/session-controller/src/client/contract/events.ts`, and
`packages/client/ui-conversation/src/client/conversation/assembler.ts`.
Test interleaved attempts, retry/cancel settlement, fragmented tool identity,
history versus live output, reconnect and single accounting.

## Team messages — historical 0.1.3-alpha.1

The experimental Team tool `send_message` steers a running teammate, starts an
idle one, and cold-resumes an inactive one. The old quiet-message versus
`followup_task` wake-up split is gone. `wait_agent` never wakes peers and can
report `noProgress` if none can progress; send work before waiting.

Preserve exact live-Agent authority, queue-and-flush-before-delivery, sender
attribution, order and cold-resume deduplication. The packages remain private
and experimental; do not add them to the publishable Tool closure. Inspect
`packages/experimental/tool-agent-team/src/index.ts` and the Team subsystem.

## Files, transport and native delivery — historical 0.1.3-alpha.1

General file upload is distinct from image input. `FileBlock` keeps an
attachment-owned immutable reference in durable user content. Request assembly
projects it to deterministic handle text and a read-only saved path, **not**
native provider file input. Do not make every LLM adapter accept a raw file
block or pass browser-local paths/secrets to a provider. Respect Host
`fileUploads` versus Client `fileUpload` ownership, cancellation, progress and
session-switch state. Inspect `packages/llm/llm/src/types.ts`,
`packages/client/file-upload/src/index.ts` (Host) and `src/client/` (Client).

`@deepseek-ai/dsh-http-proxy` is a process library, not an injected Cordis
service. Startup calls `installProxyFromEnvironment`; built-in fetch uses its
global dispatcher. SDKs with their own transport must use the selected route
(`proxyRouteFor`), and subprocess providers use `proxyEnvironmentForChild`.
`clearedProxyEnv` supports isolated replay. Test proxy/no-proxy routing and
cancellation separately at each transport seam; global fetch configuration
does not automatically configure every SDK.

JSONL adds native `fs-ext` (and uses `koffi`). Keep native lifecycle allowlists
narrow and exercise the target platform's install/lock behavior. These runtime
dependencies and the six new workspace packages are not automatically direct
dependencies of the generated Tool: derive its actual closure from the catalog.

## Historical alpha.1 acceptance boundary

The official [alpha.1 release notes](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.1)
record a historical-session loading performance regression. Passing migration
correctness tests does not clear it. Before deploying history-heavy workloads,
measure representative cold-open/query latency and memory against the previous
build with the same fixtures; record an agreed budget or keep that acceptance
pending. Do not rewrite upstream storage as part of this tooling upgrade.
