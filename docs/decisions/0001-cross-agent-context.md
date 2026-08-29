# 0001 — One DSH context source for Codex and Claude Code

Status: accepted

## Decision

Keep the complete DSH development skill under
`skills/dsh-plugin-dev/`. Expose it to Codex repository discovery through a
thin `.agents/skills/dsh-plugin-dev/SKILL.md` entry and to Claude Code through a thin
`.claude/skills/dsh-plugin-dev/SKILL.md` compatibility entry. Keep always-active
project rules in `docs/agent/PROJECT_CONTRACT.md`, reached from both
`AGENTS.md` and `CLAUDE.md`.

For use outside this repository, install the canonical directory itself into
both personal discovery roots: `$HOME/.agents/skills/dsh-plugin-dev` for Codex
and `$HOME/.claude/skills/dsh-plugin-dev` for Claude Code. The default installer
preflights both destinations before creating either link and refuses conflicts.

## Rationale

Codex Plugin packaging requires the distributable skill under `skills/`, while
Codex and Claude Code discover repository skills through tool-specific
directories. Compatibility files are portable across filesystems and agents,
while copied full skills would drift and repository symlinks would add an
unnecessary packaging assumption.

## Consequences

- Shared DSH rules are edited once.
- Each agent retains its native discovery path and explicit invocation syntax.
- One install command serves both agents while agent-specific install commands
  remain available for repair or constrained environments.
- Validation must ensure the compatibility entry still points to the canonical
  skill.
- Tool-specific frontmatter and dynamic shell injection stay out of the
  canonical skill unless both agents support the behavior.
