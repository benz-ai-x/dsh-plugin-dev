# 0008 — Tooling 0.3.0 on the audited alpha.4 baseline

Status: Accepted
Date: 2026-09-02

## Context

`dsh-plugin-dev` `0.2.0` covered the audited DeepSeek Harness
`0.1.2-alpha.3` baseline. Upstream then published `dsh-v0.1.2-alpha.4`
(commit `4e84901e6471b79ec0338099867ebb4606d12bb5`, 2371 changed files).
The stable-to-edge review found no break in the surfaces this tooling pins:
`vendor/loader`, the persistence event vocabulary, projection change-feed
gating, the tool registry, the closed surface event set, both product Skill
bodies, and the Node/pnpm toolchain are unchanged. The observable changes are
branded `SessionSeq`/`SessionLogOffset` boundary types, the fork-header
`seedLength` → `isSeeded`/`inheritedEventCount` split, the subagent
`followup()` → `sendMessage()` rename with narrowed routing, the
`dsh-tool-subagent-report` removal, and `dsh-code-runtime-python` moving to
experimental. No repository reference cited a renamed or removed symbol.

## Decision

Release the tooling as `0.3.0` in `package.json` and the Codex Plugin
manifest on the audited `0.1.2-alpha.4` baseline, carrying the branded-
sequence boundary guidance in `core-contracts.md`.

## Consequences

- The compatibility mapping is: tooling `0.2.0` → DSH `0.1.2-alpha.3`,
  tooling `0.3.0` → DSH `0.1.2-alpha.4`.
- `verify-context` pins `0.3.0` and still requires the Codex Plugin manifest
  to match `package.json`.
- The repository package stays private; the P5 release-packaging workflow
  remains open, so `0.3.0` is a repository-level release line.
- Generated projects never follow the tooling version implicitly; their own
  lock records the audited baseline and delivery mode.
