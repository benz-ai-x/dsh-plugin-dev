# 0003 — Source-linked build readiness and relocation

Status: accepted

## Decision

Treat a generated project's pinned Harness source overlay as two related but
distinct compatibility planes:

1. tracked and non-ignored Harness inputs must match the locked commit and
   remain clean, and the ignored root `.env` loaded by the source CLI must be
   absent; ignored dependency/build output remains allowed;
2. every directly linked package's declared `main` and `types` entries must
   exist and be no older than its manifest/source inputs.

Generated projects pin the Harness Node engine, import their own package name
after build to traverse public exports, create and inspect a real package
archive, and exercise bundle add/dump/remove through an isolated pinned DSH
profile. When a Harness checkout moves, `pnpm context:sync` rewrites the six
static development `link:` dependencies and the recorded fallback together;
`DSH_HARNESS_ROOT` selects the source but does not silently mutate a manifest.

## Rationale

The pinned DSH packages execute ignored `lib` artifacts. A matching Git commit
and documentation digest therefore do not prove that Node will load present or
current code. Conversely, embedding one machine's absolute checkout path as a
permanent contract would make otherwise valid generated projects fail after a
directory move.

Checking declared entries closes the common missing/stale-build gap while an
explicit synchronization command keeps relocation observable and reviewable.
Built self-import, archive creation, and real profile composition catch package
exports and bundle metadata that source-level tests bypass.

## Consequences

- Generation and strict context checks stop on tracked/non-ignored changes, an
  ignored root `.env`, or missing and visibly stale directly linked artifacts.
- The freshness comparison is an mtime guard, not a content-addressed artifact
  attestation. It cannot justify registry publication by itself.
- `context:sync` performs a non-frozen dependency install so the package
  manager lock and materialized links match the rewritten manifest.
- Generated projects stay private and publication remains blocked until an
  ordinary registry-resolvable closure passes packed install and profile boot.
