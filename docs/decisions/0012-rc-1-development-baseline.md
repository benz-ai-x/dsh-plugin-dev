# 0012 — Select DSH 0.1.2-rc.1 for local development

Date: 2026-09-05

## Decision

At the user's explicit request, select official tag `dsh-v0.1.2-rc.1`, commit
`a66e4702047846cdaa10c66c9d3df3951f5ea70d`, for both stable and edge. Retire
`0.1.3-alpha.1` as an active candidate; its previous source-only acceptance and
15 unavailable npm versions remain historical evidence, not rc.1 blockers.

The switch follows the existing clean-worktree → edge update → Registry
check → same-channel verification → promotion workflow. It does not edit
stable's identity directly, substitute rc.1 packages into an alpha.1 runtime,
or infer Registry readiness from tarball downloads.

## Reviewed contract

Relative to the former stable alpha.4, rc.1 has 266 workspace packages, the
same Tool declaration closure and toolchain, unchanged manifest contracts
apart from package versions, and unchanged official Skill resources. The
substantive runtime delta is storage/projection-cache read compatibility and
invalid derived-record recovery. Version-specific guidance records those
boundaries; alpha.1 persistence handles, format-v2, streams and Team APIs are
not rc.1 APIs.

The complete Tool Registry check reports 24 available requirements and zero
blocked requirements. Final digest-bound verification under `baselines/`
and the current acceptance record establish the actual tested scope; this
decision alone is not verification evidence.

## Local resolution and retained state

The lock uses the relocatable sibling fallback
`../deepseek-harness-baseline-0.1.2-rc.1`, a clean detached official-tag
worktree installed with the frozen lock and built with `pnpm@11.7.0`.
The clean normal `deepseek-harness` checkout used by this machine's
`DSH_HARNESS_ROOT` is also detached at rc.1 and rebuilt, without moving its
`master` branch. This makes default companion analysis and source development
agree without modifying global shell configuration or changing path
precedence.

The normal checkout's downgrade exposed six alpha.1-only directories with
ignored build/dependency contents: file-upload, session-format-catalog,
session-format-v0-to-v1, session-format-v1-to-v2, session-format and http-proxy.
The workspace build glob consumed them even without their removed manifests.
They were moved to an external recovery directory, not deleted. A forced
Host/Client TypeScript build also refreshes retained declaration timestamps;
strict validation is not weakened to accommodate stale artifacts.

Preserve earlier tagged worktrees, the recovered broken-worktree backup and
Git history. Do not migrate existing generated projects or touch user
profiles, Sessions or other Harness-home data. In particular, selecting rc.1
does not establish downgrade compatibility with alpha.1's format-v2 data.
Profile verification uses isolated temporary homes.

This is a local development-baseline change, not a new tooling release.
The tooling package remains `0.3.0`; publishing and release preparation
remain separate tasks.
