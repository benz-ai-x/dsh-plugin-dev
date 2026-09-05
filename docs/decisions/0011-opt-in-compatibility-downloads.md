# 0011 — Opt-in exact npm tarball downloads

Date: 2026-09-05

## Decision

Extend the project compatibility companion with an explicit
`--download-missing --download-dir PATH` mode. Default analysis remains
read-only and network-free. This is a bounded addition to decision 0009, not
an installer, full dependency solver, baseline updater or publication gate.

Each candidate's actual declaration graph supplies public workspace package
identities and exact external edges. No DSH versions or missing-package lists
are embedded in code. Conditional targets retain their labels; private and
non-exact declarations remain visible deferred work. External transitive
resolution remains outside this mode.

Use the explicitly selected Registry (public npm by default) and existing
user-level npm authentication without copying the audited project's npmrc.
Download only ordinary name@exact-version specs with lifecycle scripts
disabled, in an isolated temporary npm context. Validate exact identity and
strong SRI against current metadata. Store verified tarballs in an owned cache
outside the project, Harness and distributed Skill; reject collisions and
preserve corrupted existing files for inspection rather than overwriting them.

Re-query metadata when reusing cached bytes. Report not-found, authentication,
network and integrity/storage failures separately; do not replace unavailable
versions with old/latest releases or source builds. Return a distinct partial
result for failures, private/non-exact targets or graph gaps. Never modify
package manifests, dependency locks, node_modules, profiles or audit evidence.

## Validation boundary

Fixture regressions cover dynamic selection, cache reuse, identity/integrity
checks, safe output and Registry inputs, redacted failures, a real local npm
Registry tarball, default no-download behavior and packaged/relocated entry
execution. These checks establish tooling behavior, not compatibility of an
upstream Harness release or installability of the complete runtime closure.
