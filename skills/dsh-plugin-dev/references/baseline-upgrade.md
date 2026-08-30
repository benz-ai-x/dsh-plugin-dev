# Audited DSH Baseline Upgrades

Read this reference when DeepSeek Harness publishes a new official version or
the user asks to synchronize this development tool, its official product
Skills, generated projects, or publication contract with upstream.

Treat a new Harness release as an `edge` candidate. Never point stable at a
moving branch, a dirty development checkout, or a symlink whose target is not
the exact locked tag and commit.

Use the repository operator runbook at
`docs/agent/BASELINE_UPGRADE.md` when working in the `dsh-plugin-dev` source
repository. Its mechanical sequence is:

1. prepare and build a clean detached worktree at the official DSH tag;
2. scan it, update edge, and review the stable-to-edge package/Skill/toolchain
   diff;
3. revise affected contracts, references, templates, tests, and migration
   guidance;
4. pass strict source plus the full generated-project verification ladder;
5. query the complete Tool Registry closure;
6. promote only when verification is passed and Registry closure is ready.

The official product Skill snapshots are upstream instructions for dynamic
Cordis runtime development. Their presence does not supply runtime-only tools
such as `cordis_inspect_*`, `cordis_define`, or `cordis_run`. Catalog and pin
them for provenance, and expose them only in a runtime that actually provides
those tools. Upstream maintainer Skills are repository-contribution workflows;
fixtures are test data. Neither category becomes an external plugin-development
Skill merely because it exists in the source tree.

For an existing generated project, do not silently change its lock, static
`link:` dependencies, configuration, or business implementation. Produce a
reviewable migration that selects the new audited channel, synchronizes links,
updates package/toolchain versions derived from the new catalog, and reruns the
same Loader/profile/packed-artifact tests required by its shipped surface.
