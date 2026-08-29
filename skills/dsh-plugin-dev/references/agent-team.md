# Agent Team Extensions

Read this reference for teammate, roster, mailbox, shared-task, Team Remote/UI,
or other Agent Team extension work. Also read the tool, service, Client, and
packaging references required by the selected surface.

## Audited upstream state

At the pinned DSH revision, Agent Teams is an experimental, private package
family:

- `packages/experimental/agent-team`
- `packages/experimental/tool-agent-team`
- `packages/experimental/client-ui-agent-team`
- `packages/experimental/agent-team-profile`
- `packages/experimental/agent-team-web-profile`

These packages use `private: true`, omit `publishConfig`, and are excluded from
the release family. A publishable external plugin cannot name them as npm
dependencies until they are promoted or published. TypeScript workspace aliases
or a local checkout do not remove that distribution constraint.

Before creating runtime packages, choose and record one route:

1. contribute the extension within the upstream experimental tree;
2. build a clearly local-only overlay against a pinned Harness checkout; or
3. independently implement the needed public contracts without importing the
   private package family.

Do not begin a package layout that assumes one route while the project still
claims another.

## Current domain model

Each ordinary root Agent is the implicit Team Lead. The Team id equals the root
Session id. Teammates are named, continuable direct children. Names are durable,
lower-kebab-case reservations and are never reused, including after failed
provisioning.

The exact live `Agent` is the authority credential. Only the Lead may create or
interrupt teammates and assign work to another member. Every member may read
the Team, send peer messages, and operate on its authorized tasks.

Canonical reading:

- `docs/subsystems/agent-team.md`
- `packages/experimental/agent-team/README.md`
- `packages/experimental/agent-team/src/index.ts`
- `packages/experimental/tool-agent-team/src/index.ts`

## Durable facts and derived state

The Lead Session log is the single Team truth. Current persisted event families
are:

- `team/member` — complete member/provisioning snapshot;
- `team/message/queued` — a durable accepted peer message;
- `team/message/delivered` — target acceptance acknowledgement;
- `team/task` — complete versioned task snapshot/tombstone.

They are log-only and do not enter model history. Roster, mailbox, task board,
readiness, and warnings are replayed views. The invariant companion folds each
candidate event against the committed prefix before append.

Commit and flush a queued message before attempting delivery. A successful send
is already durable when the immediate result says `queued`; callers must not
retry it as a new message. Target-session evidence prevents duplicate delivery
during recovery.

## Roster and lifecycle

Teammate creation is a transaction:

1. validate Lead authority, name, limits, provider, and context mode;
2. append and flush the provisioning reservation;
3. ask the continuable-subagent provider to create the child;
4. append and flush `active` or durable `failed` terminal state;
5. publish/wake observers only after commit.

Fresh children receive no Lead history. Fork children receive one completed-turn
prefix. Recovery reconciles a dangling provisioning record with the child's
independently persisted Session and descriptor.

Disposal closes admission, releases waits, settles admitted provisioning and
dispatch operations, and stops only Team-owned direct children plus their
descendants. It does not indiscriminately cancel other continuable children.

## Shared task board

Tasks are whole versioned snapshots. Every mutation uses the caller's current
`expectedRevision`; stale writes fail with a stable conflict instead of silently
overwriting another member.

Dependencies form a DAG. A task is ready only when every blocker is complete.
Task readiness never starts an owner. Ownership survives idle, interruption,
and process exit unless an explicit policy changes it.

Write scopes are normalized workspace-relative advisory prefixes. Overlap may
produce warnings but is neither a lock nor filesystem authority. Bash,
formatters, generators, and external processes can bypass optimistic file
guards, so the Lead must coordinate and review shared-checkout changes.

## Tool and profile collision rules

The experimental Team tool package installs scoped tools such as teammate
creation, message/follow-up, list/wait/interrupt, and task-board operations.
Some names overlap global continuable-subagent controls. The Team profile
explicitly disables the conflicting global rows before inserting Team-owned
tools; never depend on last registration winning.

Team tools are registered into the exact Agent scope after membership is known.
They obtain authority from `exec.agent`, not a model-supplied id. The system
prompt states that teammates are created only when the user explicitly asks for
Team behavior.

Inspect:

- `packages/experimental/agent-team-profile/cordis.patch.yml`
- `packages/experimental/tool-agent-team/src/index.ts`
- `packages/experimental/agent-team-profile/tests/profile.spec.ts`

## Current limitations that may motivate Ultra

The upstream package deliberately does not yet provide:

- nested Teams;
- per-member worktrees or filesystem locks;
- remote/cross-process Team coordination;
- automatic task-owner release;
- rename, deletion, or member-name reuse;
- cross-process exactly-once mailbox delivery.

Treat this list as candidate problem space, not an instruction to implement all
items. Choose one user-visible first increment and define its non-goals.

## Required decision record for Ultra

Before implementation, record:

- the specific user problem and first observable scenario;
- which existing limitation changes and which remain;
- upstream-internal, local-only, or publishable-external delivery route;
- whether the existing `agentTeams` contract is consumed, extended, replaced,
  or independently reimplemented;
- authority and trust boundaries;
- durable event/version migration impact;
- shared-checkout/worktree semantics;
- tool name collision and profile overlay plan;
- headless and/or Web surface;
- recovery, cancellation, and disposal Definition of Done.

## Required tests

In addition to the common plugin ladder, cover:

- exact Lead/member authority for every operation;
- permanent name reservation and member limits;
- provisioning crash/recovery and provider failure;
- mailbox queue-before-delivery, order, de-duplication, and cold resume;
- task DAG validation, CAS conflict, ownership, tombstones, and id exhaustion;
- wait race boundaries, timeout, cancellation, and disposal release;
- Team-only child teardown without collateral cancellation;
- explicit tool collision handling in the real profile;
- log-only events staying out of model history;
- Remote domain conflict versus transport failure;
- UI navigation and whole-view refresh for Web work;
- the single new Ultra scenario through a real application composition.
