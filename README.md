# DSH Plugin Dev

[中文使用手册](#中文使用手册) | [English Quick Guide](#english-quick-guide)

## 中文使用手册

### 这是什么

`dsh-plugin-dev` 是供 Codex 和 Claude Code 共用的 DeepSeek Harness 插件开发 Skill。你只需安装一次，然后在任意空目录中描述业务需求，Code Agent 就会判断 DSH 扩展形态、生成项目脚手架，并继续完成业务实现和验证。

本仓库是插件开发工具，不是 DSH 运行时插件。当前确定性生成器支持 Host 侧、面向模型的 Tool 插件；Service、Client、LLM Adapter、Bundle/Profile 和 Agent Team 需求仍可通过 Skill 中的专项指南开发，但尚无确定性模板。

### 环境要求

- Node.js `^22.19.0` 或 `>=24.0.0`（与锁定的 Harness 一致）
- pnpm 11
- 本地 DeepSeek Harness 源码检出，且版本与 `dsh-reference.lock.json` 一致；tracked/non-ignored 源码需 clean，根目录不得有会被 CLI 加载的 `.env`，并先执行 `pnpm install && pnpm run build`
- Codex、Claude Code，或两者都安装

如果 Harness 不在默认相对位置，请先设置：

```sh
export DSH_HARNESS_ROOT=/path/to/deepseek-harness
```

### 安装

```sh
git clone git@github.com:benz-ai-x/dsh-plugin-dev.git
cd dsh-plugin-dev
pnpm install
pnpm context:check:strict
pnpm install:skill
```

`pnpm install:skill` 会安全地创建两个用户级链接：

- Codex：`$HOME/.agents/skills/dsh-plugin-dev`
- Claude Code：`$HOME/.claude/skills/dsh-plugin-dev`

两个 Agent 始终读取同一份 Skill、参考资料、生成器和模板。安装器不会覆盖同名的无关文件；也可以只安装一个入口：

```sh
pnpm install:codex
pnpm install:claude
```

### 在空目录创建插件

Codex：

```sh
mkdir aaa
cd aaa
codex
```

```text
使用 $dsh-plugin-dev 创建一个 DSH Tool 插件。
它接收仓库路径，查找超大文件并返回结构化报告。完成实现和验证。
```

Claude Code：

```sh
mkdir aaa
cd aaa
claude
```

```text
/dsh-plugin-dev 创建一个 DSH Tool 插件。
它接收仓库路径，查找超大文件并返回结构化报告。完成实现和验证。
```

生成完成后，项目通常可用以下命令独立验证：

```sh
pnpm verify
```

### 常见问题与限制

- 如果空目录出现 `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`，说明在生成 `package.json` 前执行了 pnpm。先启动 Codex 或 Claude Code 并调用本 Skill，生成脚手架后再运行 pnpm。
- 生成项目绑定 `dsh-reference.lock.json` 中审计过的 Harness 版本；源码锁不匹配时会停止，而不会静默套用错误契约。
- Harness checkout 移动后，在生成项目内运行 `DSH_HARNESS_ROOT=/new/path pnpm context:sync`；该命令会改写六个 `link:` 依赖并刷新 lockfile，仅设置环境变量不会改写它们。
- 当前 DSH 依赖闭包尚不能全部从普通 npm Registry 获取，因此生成项目使用本地 Harness 源码链接并保持 `private: true`。本地验证通过不等于已经具备独立 npm 发布条件。

### 验证本仓库

```sh
pnpm verify
```

架构、验收证据和后续计划分别见 `docs/agent/ARCHITECTURE.md`、`docs/agent/ACCEPTANCE.md` 和 `TODO.md`。

---

## English Quick Guide

### What this is

`dsh-plugin-dev` is a shared DeepSeek Harness plugin-development Skill for Codex and Claude Code. Install it once, then describe a business requirement from any empty directory. The code agent classifies the DSH extension shape, generates a project scaffold, and continues through the real implementation and verification.

This repository is development tooling, not a DSH runtime plugin. The deterministic generator currently supports Host-side, model-facing Tool plugins. The Skill also guides Service, Client, LLM Adapter, Bundle/Profile, and Agent Team work, but deterministic templates for those shapes are still on the roadmap.

### Requirements

- Node.js `^22.19.0` or `>=24.0.0`, matching the pinned Harness
- pnpm 11
- A local DeepSeek Harness checkout matching `dsh-reference.lock.json`, with clean tracked/non-ignored source inputs, no root `.env` that the CLI could load, and prepared with `pnpm install && pnpm run build`
- Codex, Claude Code, or both

If Harness is not at the default relative location, set:

```sh
export DSH_HARNESS_ROOT=/path/to/deepseek-harness
```

### Install

```sh
git clone git@github.com:benz-ai-x/dsh-plugin-dev.git
cd dsh-plugin-dev
pnpm install
pnpm context:check:strict
pnpm install:skill
```

`pnpm install:skill` safely creates both personal Skill links:

- Codex: `$HOME/.agents/skills/dsh-plugin-dev`
- Claude Code: `$HOME/.claude/skills/dsh-plugin-dev`

Both agents read the same Skill, references, generator, and templates. The installer never overwrites an unrelated path. Install only one integration when needed:

```sh
pnpm install:codex
pnpm install:claude
```

### Create a plugin from an empty directory

With Codex:

```sh
mkdir aaa
cd aaa
codex
```

```text
Use $dsh-plugin-dev to create a DSH Tool plugin that accepts a repository path,
finds oversized files, and returns a structured report. Implement and verify it.
```

With Claude Code:

```sh
mkdir aaa
cd aaa
claude
```

```text
/dsh-plugin-dev Create a DSH Tool plugin that accepts a repository path,
finds oversized files, and returns a structured report. Implement and verify it.
```

After generation, the project can normally be verified independently with:

```sh
pnpm verify
```

### Troubleshooting and limitations

- `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND` in an empty directory means pnpm ran before the scaffold created `package.json`. Start Codex or Claude Code and invoke this Skill first; run pnpm after generation.
- Generated projects are locked to the audited Harness revision in `dsh-reference.lock.json`. A source mismatch stops generation instead of silently applying the wrong contract.
- After moving the Harness checkout, run `DSH_HARNESS_ROOT=/new/path pnpm context:sync` inside the generated project. It rewrites the six `link:` dependencies and refreshes the lockfile; setting the variable alone does not rewrite them.
- The complete pinned DSH dependency closure is not yet available from an ordinary npm registry. Generated projects therefore use local Harness source links and remain `private: true`. Passing local verification does not prove independent npm publication readiness.

### Verify this repository

```sh
pnpm verify
```

See `docs/agent/ARCHITECTURE.md`, `docs/agent/ACCEPTANCE.md`, and `TODO.md` for architecture, acceptance evidence, and the live roadmap.

The discovery model follows the official [OpenAI Skills](https://learn.chatgpt.com/docs/build-skills), [OpenAI Plugins](https://learn.chatgpt.com/docs/build-plugins), and [Claude Code Skills](https://code.claude.com/docs/en/skills) documentation.
