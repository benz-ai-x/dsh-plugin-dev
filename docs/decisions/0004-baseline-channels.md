# 0004 — Audited stable and edge DSH baseline channels

Status: accepted

## Decision

Represent upstream compatibility as two content-addressed channels in
`dsh-reference.lock.json` schema v2.

`stable` remains the default generator and verification contract. `edge` is a
candidate produced only from a clean official tagged Harness worktree. Each
channel pins the tag, commit, Node and package-manager contracts, documentation
digest, full workspace package catalog, official Skill catalog, product-Skill
snapshots, Tool publication closure, Registry report, and repository
verification report.

An edge update invalidates its previous Registry and verification evidence.
Promotion to stable requires a Registry-ready ordinary-install closure and a
passed full repository verification bound to the same catalog digest.

## Rationale

A version string and source commit do not describe package graph changes,
official Skill drift, toolchain drift, or whether the exact runtime closure can
be installed outside the Harness monorepo. A single mutable lock also forces a
choice between testing the next official tag and preserving a known baseline.

Content-addressed catalogs make the reviewed contract explicit. Separate
channels allow source-linked evaluation to continue without turning an
unpublished candidate into the default or confusing source compatibility with
publication readiness.

## Consequences

- Upstream changes first update edge and produce a mechanical stable-to-edge
  diff.
- The two official Cordis product Skills are materialized as pinned snapshots;
  all upstream Skills are cataloged and hashed, while maintainer and fixture
  Skills are not exposed as product development Skills.
- Local symlinks may select a clean candidate worktree, but committed stable
  artifacts remain snapshots with provenance and hashes.
- Generated projects record one selected channel and exact catalog digest. An
  upgrade is explicit and reviewable.
- Until the Registry closure is ready, edge remains source-linked and
  publication stays blocked.
