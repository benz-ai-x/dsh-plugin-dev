# Codex project entrypoint

Before substantive work, read these files completely:

1. `docs/agent/PROJECT_CONTRACT.md`
2. `TODO.md`

For any DeepSeek Harness plugin task, use the repository skill
`dsh-plugin-dev` from `skills/dsh-plugin-dev/SKILL.md`. Read only the
task-specific references it routes to.

Run `pnpm context:check` before planning or editing. Run
`pnpm context:check:strict` before claiming compatibility with the pinned DSH
source. Stop and report a version-lock mismatch instead of silently developing
against a different Harness contract.

`AGENTS.md` and `CLAUDE.md` are discovery adapters. Shared policy belongs in
`docs/agent/PROJECT_CONTRACT.md`; shared DSH workflow belongs in the canonical
skill. Do not duplicate either body here.
