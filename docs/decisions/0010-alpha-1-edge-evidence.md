# 0010 — Version-specific edge guidance and delivery evidence

Date: 2026-09-05

## Decision

Retain stable at DSH `0.1.2-alpha.4`; stage the official `0.1.3-alpha.1`
tag in edge. Shared Cordis/Tool guidance remains usable while
`references/version-contracts.md` routes incompatible persistence, stream,
Client and Team semantics by exact commit. Future candidate analysis still
discovers its facts dynamically; this reviewed delta is not a version list
required by the compatibility analyzer.

The first alpha.1 Registry recheck found 15 unavailable exact first-party
Tool-closure packages (public Registry E404), with five vendor packages and
four external ranges available. This blocks Registry delivery and promotion,
not source-linked candidate verification. Do not add unrelated new workspace
packages to the Tool's unchanged 20-node publication closure.

## Acceptance correction

The previous Registry e2e selected any ready channel but booted the selected
source channel's CLI. With divergent channels it could mix stable packages
and edge runtime and mislabel evidence. Tests now select one channel end to
end. A blocked channel explicitly skips ordinary-install acceptance and must
refuse Registry generation rather than fall back.

Verification reports use schema v2 and record the exact Registry digest/status
seen by that run. Preflight requires a ready report with the same binding.
Rechecking availability after a source-only pass cannot authorize promotion
without a new archive/profile verification run. Inputs changing during the
run prevent writing a passed report. Promotion relabels and rehashes the same
checked Registry data; it does not reinterpret source-only evidence.

## Scope and remaining gates

Only Tool scaffolding has deterministic runtime acceptance. The new reference
documents other surfaces; it does not add Service/Client/LLM/Team generators.
Migration correctness is checked using the official candidate's released-format,
JSONL generation/write-lease and Agent-loop resume regressions. This does not
claim all user logs migrate, certify another OS, or resolve the upstream
historical-load performance regression. History-heavy deployment needs a
representative fixture and latency/memory budget.

Stable's broken local worktree is preserved separately and reconstructed at
the same locked tag. No user data is deleted, and environment recovery does
not change the audited baseline. Current verification details belong in
`docs/agent/ACCEPTANCE.md` and the generated channel reports.
