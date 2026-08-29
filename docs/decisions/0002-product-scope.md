# 0002 — Reusable DSH development Skill and source-linked Tool scaffold

Status: accepted

## Decision

Build `dsh-plugin-dev` as reusable development tooling rather than a product-specific DSH runtime plugin. The repository ships one canonical Skill, a skills-only Codex Plugin manifest, a safe user-level installation path, and deterministic project generators. A developer can start Codex in an unrelated directory, describe a business capability, and let the Skill classify, scaffold, implement, and verify the matching DSH extension.

The first deterministic generator supports a Host-side model-facing Tool plugin. Other DSH shapes remain reference-guided workflows until each has equivalent lifecycle, Loader, and external-world acceptance.

Generated projects use the exact local Harness source pinned by `dsh-reference.lock.json`. They remain private while the audited `@deepseek-ai/dsh-*` dependency closure is unavailable from the configured npm registry.

## Rationale

Repository-local instructions do not satisfy the empty-directory experience. Codex user skills provide immediate cross-project discovery, while a Codex Plugin is the supported reusable distribution unit. One canonical Skill can serve repository discovery, a user-level link, and Plugin packaging without duplicating DSH policy.

A deterministic Tool slice exercises the central contracts needed by later generators: namespace export normalization, service injection, runtime configuration, canonical tool values, cancellation, lifecycle cleanup, Loader composition, bundle activation, and source-versus-publication boundaries.

The pinned DSH source exposes public package manifests, but the key runtime packages are not available from the configured registry at the audited version. Source links provide honest local development and real tests; they do not prove an independently installable package closure.

## Consequences

- `dsh-plugin-dev` is the repository and Plugin name; Agent Team remains one optional DSH extension category.
- The canonical Skill must be discoverable outside this checkout after one safe install step.
- Natural-language interpretation stays with the agent; deterministic scripts validate and materialize a small project specification.
- Unsupported generator kinds fail explicitly instead of producing superficially plausible boilerplate.
- Generated package manifests carry semver peer contracts but source-linked development dependencies and `private: true`.
- Registry publication remains blocked until dependency availability and clean packed-artifact tests prove it.
