# Claude Code project entrypoint

Before substantive work, read these files completely:

1. `docs/agent/PROJECT_CONTRACT.md`
2. `TODO.md`

For any DeepSeek Harness plugin task, use `/dsh-plugin-dev`. The Claude Code
entry under `.claude/skills/dsh-plugin-dev/` delegates to the canonical shared
skill under `skills/dsh-plugin-dev/`.

Run `pnpm context:check` before planning or editing. Run
`pnpm context:check:strict` before claiming compatibility with the pinned DSH
source. Stop and report a version-lock mismatch instead of silently developing
against a different Harness contract.

`CLAUDE.md` and `AGENTS.md` are discovery adapters. Shared policy belongs in
`docs/agent/PROJECT_CONTRACT.md`; shared DSH workflow belongs in the canonical
skill. Do not duplicate either body here.
