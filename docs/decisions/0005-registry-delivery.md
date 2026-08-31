# 0005 — Explicit source and Registry Tool delivery

Status: accepted

## Decision

Keep `source` as the backward-compatible default Tool scaffold delivery and
add an explicit `registry` mode. Registry generation is fail-closed: the
selected stable/edge catalog must have a digest-valid Tool closure report with
status `ready` and every recorded requirement available.

Source projects remain private, use the six audited local Harness links, and
retain `context:sync`. Registry projects use exact ordinary versions, contain
no `link:` or `workspace:` dependency, set public non-private package metadata,
copy the evidence into `dsh-registry.lock.json`, and have no Harness path or
source synchronization command.

Registry acceptance installs and verifies the generated project, packs it,
installs that exact archive into a second clean consumer and imports its public
entry, then uses the pinned official DSH CLI to add, dump, boot, gracefully
stop, remove, and prove post-remove absence in an isolated profile.

## Rationale

DSH `0.1.2-alpha.1` did not expose the complete Tool publication closure in
the configured Registry, so source-only delivery was the truthful initial
contract. DSH `0.1.2-alpha.2` publishes the audited closure. Availability alone
is not enough: generation must remain bound to the catalog/report digests, and
the package actually released must be the installable archive exercised by the
consumer and Harness profile.

## Consequences

- Existing source projects do not change implicitly and stay non-publishable.
- A newer baseline invalidates Registry evidence and disables Registry
  generation for that channel until the closure is checked again.
- Registry-ready means release preparation is supported; it does not mean the
  generated normalization baseline is a finished business plugin.
- Publication still requires credentials, ownership, versioning, and release
  authorization outside this generator's scope.
- This decision supersedes the source-only delivery consequence in decisions
  0002 and 0003 for baselines whose Registry report is `ready`.
