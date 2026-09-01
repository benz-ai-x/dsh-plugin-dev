# 0007 — Tooling 0.2.0 on the audited alpha.3 baseline

Status: Accepted
Date: 2026-09-01

## Context

`dsh-plugin-dev` `0.1.0` covered the TypeScript-first tooling on the audited
DeepSeek Harness `0.1.2-alpha.2` baseline. Upstream then published
`dsh-v0.1.2-alpha.3` (commit `dd6322d604e00eec1ba5e0c8541159906a21094a`).
The stable-to-edge review found no breaking contract for this tooling:
`vendor/loader`, the Session event vocabulary, the toolchain contract, and both
product Skill bodies are unchanged. The real changes are the removal of
`@deepseek-ai/dsh-session-persistence-sqlite` and the `agent-spine-demo`
example, the new `@deepseek-ai/dsh-session-turn-outline` package, and the
Session projection change feed now gating publication on raw `view` identity
(`Object.is`).

The version pin in `verify-context` exists so a version change is a deliberate
accompanied act, not silent drift.

## Decision

Release the tooling as `0.2.0` in both `package.json` and the Codex Plugin
manifest, on the audited `0.1.2-alpha.3` baseline with the projection
view-identity guidance carried in `core-contracts.md` and `client-plugin.md`.
`0.1.0` remains the mapping for the alpha.2 line in Git history.

## Consequences

- The compatibility mapping is: tooling `0.1.0` → DSH `0.1.2-alpha.2`, tooling
  `0.2.0` → DSH `0.1.2-alpha.3`.
- `verify-context` pins `0.2.0` and still requires the Codex Plugin manifest
  to match `package.json`.
- The repository package stays private; the P5 release-packaging and
  cachebuster workflow remains open, so `0.2.0` is a repository-level release
  line, not an npm publication.
- Generated projects never follow the tooling version implicitly; their own
  lock records the audited baseline and delivery mode they were built against.
