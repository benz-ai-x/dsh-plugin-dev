# DSH Plugin Dev

**DeepSeek Harness (DSH · Cordis) plugin development for Codex & Claude Code — development and compatibility-analysis Skills plus a deterministic generator, with audited baselines and real Loader/profile verification.**

[中文使用手册](#中文使用手册) · [English Quick Guide](#english-quick-guide)

[![version](https://img.shields.io/badge/version-0.3.0-4c6ef5)](package.json)
[![DSH baseline](https://img.shields.io/badge/DSH%20baseline-0.1.2--rc.1-1c7ed6)](dsh-reference.lock.json)
[![Codex](https://img.shields.io/badge/agent-Codex-000000)](skills/dsh-plugin-dev/)
[![Claude Code](https://img.shields.io/badge/agent-Claude%20Code-d97706)](skills/dsh-plugin-dev/)
[![Node](https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%3E%3D24.0.0-339933)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11.7.0-F69220)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 中文使用手册

### 这是什么

`dsh-plugin-dev` 是供 Codex 和 Claude Code 共用的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH，基于 Cordis）插件开发 Skill。你只需安装一次，然后在任意空目录中描述业务需求，Code Agent 就会判断 DSH 扩展形态、生成项目脚手架，并继续完成业务实现和验证。

本仓库是插件开发工具，不是 DSH 运行时插件。当前确定性生成器支持 Host 侧、面向模型的 Tool 插件；Service、Client、LLM Adapter、Bundle/Profile 和 Agent Team 需求仍可通过 Skill 中的专项指南开发，但尚无确定性模板。

仓库自身采用 TypeScript-first 工具链。生成器、基线管理、上下文校验和安装器的权威源码位于 `.mts` 文件，严格类型检查后编译到现有 `.mjs` 公共入口；因此安装后的 Skill 仍可直接由 Node 执行，不要求用户额外安装 `tsx`。`tooling-artifacts.json` 将源码、JavaScript 和声明文件的摘要绑定在一起。

### 核心特性

- **双 Agent 一份 Skill**：Codex（`$HOME/.agents/skills`）与 Claude Code（`$HOME/.claude/skills`）共享同一份 canonical Skill、参考资料、生成器和模板。
- **项目级兼容性分析**：配套 `version-compatibility-analysis` 每次动态读取上游版本、workspace、依赖与源码契约；分析新版无需先修改代码或版本锁。
- **审计基线双通道**：`dsh-reference.lock.json` 锁定官方 tag/commit/docs 摘要，`stable`/`edge` 内容寻址通道加上完整验证与 Registry 闭包证据，升级走可审计的 runbook。
- **双交付模式**：`source` 模式链接本地干净 Harness worktree；`registry` 模式在闭包 `ready` 时生成普通精确版本依赖与可发布 manifest。
- **真实验证阶梯**：生成项目通过 strict 源校验、类型检查、单元/HMR 测试、真实 Loader 组合、profile add/dump/boot/remove 与打包产物检查。

### 环境要求

- Node.js `^22.19.0` 或 `>=24.0.0`（与锁定的 Harness 一致）
- pnpm 11
- 验证本仓库或使用 `source` 交付时，需要与 `dsh-reference.lock.json` 一致的本地 DeepSeek Harness；tracked/non-ignored 源码需 clean，根目录不得有会被 CLI 加载的 `.env`，并先执行 `pnpm install && pnpm run build`。使用已审计为 `ready` 的 `registry` 生成模式时，生成项目本身不需要本地 Harness。
- Codex、Claude Code，或两者都安装

如果 Harness 不在默认相对位置，请先设置：

```sh
export DSH_HARNESS_BASELINE_ROOT=/path/to/pinned-deepseek-harness
```

### 安装

```sh
git clone https://github.com/benz-ai-x/dsh-plugin-dev.git
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

此安装器仍只安装开发 Skill。版本兼容性 Skill 是本仓库的项目级功能，通过 `.agents/skills/`、`.claude/skills/` 发现，并随 Codex Plugin 分发；不需要额外安装到用户目录。

### 分析新版 Harness（无需修改代码）

在本项目中向 Codex 发出：

```text
使用 $version-compatibility-analysis 分析本项目与 /path/to/deepseek-harness 的版本依赖兼容性，列出必要修复与验证阻塞。
```

Claude Code 使用 `/version-compatibility-analysis`。也可先运行只读证据采集：

```sh
pnpm compatibility:analyze --harness-root /path/to/deepseek-harness
```

基线自动取 `dsh-reference.lock.json` 的默认通道 commit，候选默认取指定仓库 HEAD；可加 `--target TAG_OR_COMMIT`、`--channel CHANNEL` 或 `--capability NAME`。未知锁格式可由 Agent 读取后传 `--base REF --root-package NAME`（根节点可重复），不要求修改助手代码。

“自升级”指每轮重新发现当前版本的包目录、依赖、API 和文档证据，不是自动改写 Skill 或升级已审计基线。脚本按各提交 workspace 定义重建声明依赖图，包版本/包名/目录不写死；复杂声明由 Skill 补充只读调查。默认只输出 JSON，不联网、不安装、不改锁；完整兼容性结论仍需源码、运行、迁移及发布证据，`exit 0` 只代表证据采集完成。

需要自动下载缺失的已发布精确版本包时，明确要求 Skill 下载，或运行：

```sh
pnpm compatibility:analyze --harness-root /path/to/deepseek-harness \
  --download-missing --download-dir /path/to/compat-npm-cache
```

目录必须在项目、Harness 和 Skill 之外，父目录已存在，目标为新目录或助手先前创建的缓存；可用 `--registry HTTPS_URL` 指定源，默认公共 npm。需要本机 npm。它只下载并校验 tarball、复用已验证缓存，不执行脚本或安装依赖。未发布版本无法补齐，范围/私有包保留待处理项；有缺口退出 2，不改发布门槛或基线。详见 [下载模式](skills/version-compatibility-analysis/references/npm-downloads.md)。

当前开发基线：stable 与 edge 均为官方 `dsh-v0.1.2-rc.1`
（`a66e4702047846cdaa10c66c9d3df3951f5ea70d`），不再使用
`0.1.3-alpha.1`。rc.1 的完整 Tool Registry 闭包为 **24/24 可用**，
支持已验证的 source 与 registry 两种交付；此前的 15 个 E404 属于
alpha.1 的历史结果，不是 rc.1 的缺包。
rc.1 的投影缓存恢复改动与历史版本边界见
[按版本选择的契约](skills/dsh-plugin-dev/references/version-contracts.md)。
Registry 不就绪时仍会拒绝 `--delivery registry`，不会跨版本回退；
查询更新后必须重跑同通道验证。详见 [验收记录](docs/agent/ACCEPTANCE.md)。

分析候选路径采用 `--harness-root` → `DSH_HARNESS_ROOT` → 锁中环境变量 → fallback；仓库 strict 校验继续用 `DSH_HARNESS_BASELINE_ROOT` 指向已审计版本，生成项目使用自己的 `DSH_HARNESS_ROOT`。分析不依赖旧 worktree 或新版构建产物，但需要 Git 中存在比较的两个提交；缺失基线、解析限制和未查询的 Registry 状态会明确报告。

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
- 生成器默认使用 `source`；Harness checkout 移动后，在生成项目内运行 `DSH_HARNESS_ROOT=/new/path pnpm context:sync`。该命令会改写六个 `link:` 依赖并刷新 lockfile。
- `--delivery registry` 仅接受 Registry 闭包为 `ready` 的基线，生成普通精确版本依赖、`dsh-registry.lock.json` 和可发布 manifest，不需要 Harness 路径。最终发布仍须用同一个 `.tgz` 通过干净安装/导入和真实 profile add/dump/boot/remove。

### 验证本仓库

```sh
pnpm build:check
pnpm typecheck
pnpm verify
```

架构、验收证据、项目交接和后续计划分别见 [`docs/agent/ARCHITECTURE.md`](docs/agent/ARCHITECTURE.md)、[`docs/agent/ACCEPTANCE.md`](docs/agent/ACCEPTANCE.md)、[`docs/agent/HANDOFF.md`](docs/agent/HANDOFF.md) 和 [`TODO.md`](TODO.md)；基线升级流程见 [`docs/agent/BASELINE_UPGRADE.md`](docs/agent/BASELINE_UPGRADE.md)，产品决策见 [`docs/decisions/`](docs/decisions)。

---

## English Quick Guide

### What this is

`dsh-plugin-dev` is a shared [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH, Cordis-based) plugin-development Skill for Codex and Claude Code. Install it once, then describe a business requirement from any empty directory. The code agent classifies the DSH extension shape, generates a project scaffold, and continues through the real implementation and verification.

This repository is development tooling, not a DSH runtime plugin. The deterministic generator currently supports Host-side, model-facing Tool plugins. The Skill also guides Service, Client, LLM Adapter, Bundle/Profile, and Agent Team work, but deterministic templates for those shapes are still on the roadmap.

The repository itself is TypeScript-first. Authoritative generator, baseline,
context, and installer sources use strict `.mts`; compilation preserves the
existing dependency-free `.mjs` entry paths, so an installed Skill does not
require `tsx`. `tooling-artifacts.json` binds source, JavaScript, and declaration
digests.

### Highlights

- **One Skill, two agents**: Codex (`$HOME/.agents/skills`) and Claude Code (`$HOME/.claude/skills`) read the same canonical Skill, references, generator, and templates.
- **Project compatibility companion**: discover versions, workspace packages, dependencies and changed contracts afresh; analyzing a new Harness revision requires no version-specific code or lock edits.
- **Audited baseline channels**: `dsh-reference.lock.json` pins the official tag, commit, and docs digest; content-addressed `stable`/`edge` channels carry full verification and Registry-closure evidence through an auditable upgrade runbook.
- **Two delivery modes**: `source` links a clean local Harness worktree; `registry` emits exact ordinary dependency versions and a publishable manifest once the closure is `ready`.
- **A real verification ladder**: strict source checks, typecheck, unit/HMR tests, real Loader composition, profile add/dump/boot/remove, and packed-artifact inspection.

### Requirements

- Node.js `^22.19.0` or `>=24.0.0`, matching the pinned Harness
- pnpm 11
- Verifying this repository or using `source` delivery requires a local DeepSeek Harness checkout matching `dsh-reference.lock.json`, with clean tracked/non-ignored source inputs, no root `.env` that the CLI could load, and prepared with `pnpm install && pnpm run build`. A generated project using an audited `ready` Registry delivery does not require a local Harness checkout.
- Codex, Claude Code, or both

If Harness is not at the default relative location, set:

```sh
export DSH_HARNESS_BASELINE_ROOT=/path/to/pinned-deepseek-harness
```

### Install

```sh
git clone https://github.com/benz-ai-x/dsh-plugin-dev.git
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

The personal installer above installs only the development Skill. The
`version-compatibility-analysis` companion is discovered within this repository
by Codex and Claude Code and is also included in the packaged Codex Plugin.

### Analyze a newer Harness

Invoke `$version-compatibility-analysis` (Codex) or
`/version-compatibility-analysis` (Claude Code) in this project, or collect
read-only evidence:

```sh
pnpm compatibility:analyze --harness-root /path/to/deepseek-harness
```

The base comes from the current project lock; the candidate defaults to the
specified repository's HEAD. Use `--target REF` to select another revision.
Workspace definitions and dependency roots are read from data, not a release
allowlist. Unknown lock formats can use explicit `--base REF` and repeatable
`--root-package NAME`; unsupported declarations remain visible evidence gaps
for agent-led inspection. By default, no checkout, fetch, install, lock update
or Registry query is performed. Exit zero means evidence collected, not compatibility.

For explicitly authorized tarball downloads, add `--download-missing
--download-dir /path/to/compat-npm-cache`. The parent must exist; use a new or
previously owned cache outside the project, Harness and Skill. Local npm is
required. The Registry defaults to public npm and can be selected with
`--registry HTTPS_URL`. Exact published versions are integrity-checked and
reused; no lifecycle scripts, dependency installation or audit updates occur.
Unpublished versions cannot be downloaded, and ranges/private targets remain
deferred. Partial results exit 2, not a compatibility or publication verdict.
See [download mode](skills/version-compatibility-analysis/references/npm-downloads.md).

Self-upgrading means refreshing analysis knowledge each time, not rewriting the
Skill or promoting stable. The candidate path precedence is `--harness-root`,
`DSH_HARNESS_ROOT`, the lock's environment variable, then its fallback. Pinned
repository checks still use `DSH_HARNESS_BASELINE_ROOT`. Both commits must exist
in the candidate Git repository; an old baseline worktree is not required.

Both stable and edge select official `dsh-v0.1.2-rc.1` at
`a66e4702047846cdaa10c66c9d3df3951f5ea70d`, no longer `0.1.3-alpha.1`.
The rc.1 Tool Registry closure is ready with 24/24 requirements available;
both source and Registry Tool delivery are verified. The former 15 E404s
belong to historical alpha.1 evidence, not rc.1. Read the
[version-specific contracts](skills/dsh-plugin-dev/references/version-contracts.md)
for rc.1 cache recovery and explicitly scoped historical APIs.
Registry generation still refuses an unready channel without cross-version
fallback. Rechecking Registry requires new same-channel verification;
source-only evidence cannot authorize publication.

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
- Generation defaults to `source`. After moving the Harness checkout, run `DSH_HARNESS_ROOT=/new/path pnpm context:sync`; it rewrites the six `link:` dependencies and refreshes the lockfile.
- `--delivery registry` is accepted only for a baseline with a `ready` Registry closure. It emits exact ordinary versions, `dsh-registry.lock.json`, and a publishable manifest without a Harness path. Final publication still requires clean install/import and real profile add/dump/boot/remove using the same `.tgz`.

### Verify this repository

```sh
pnpm build:check
pnpm typecheck
pnpm verify
```

See the [architecture notes](docs/agent/ARCHITECTURE.md), [acceptance evidence](docs/agent/ACCEPTANCE.md), the [maintainer handoff](docs/agent/HANDOFF.md), the [baseline upgrade runbook](docs/agent/BASELINE_UPGRADE.md), [product decisions](docs/decisions), and [`TODO.md`](TODO.md) for architecture, acceptance evidence, current handoff state, and the live roadmap.

The discovery model follows the official [OpenAI Skills](https://learn.chatgpt.com/docs/build-skills), [OpenAI Plugins](https://learn.chatgpt.com/docs/build-plugins), and [Claude Code Skills](https://code.claude.com/docs/en/skills) documentation.
