# dsh-plugin-dev 项目交接

交接日期：2026-08-30

仓库：`git@github.com:benz-ai-x/dsh-plugin-dev.git`

分支：`main`

本文是维护状态快照，不是新的规范来源。发生冲突时，以
[`PROJECT_CONTRACT.md`](PROJECT_CONTRACT.md)、
[`SKILL.md`](../../skills/dsh-plugin-dev/SKILL.md)、
[`TODO.md`](../../TODO.md) 和
[`docs/decisions/`](../decisions/) 为准。

## 一句话状态

项目已经实现一套由 Codex 与 Claude Code 共用的 DSH 插件开发 Skill，
并把官方 DeepSeek Harness 的包清单、产品 Skill、工具链和发布闭包纳入
内容寻址的 `stable`/`edge` 双通道审计。开发者安装一次后，可以在无关
空目录中描述业务需求并生成绑定 `stable` 的 Tool 插件项目。当前只有
Host 侧 model-facing Tool 具备确定性生成器；其他插件形态已有开发指南，
尚未有同等级脚手架。

## 当前能力

| 能力 | 状态 | 说明 |
|---|---|---|
| Codex 与 Claude Code 共用一个 Skill | 完成 | 两个 Agent 的仓库入口和用户级安装均指向同一 canonical Skill，不复制知识正文。 |
| 空目录 Tool 项目生成 | 完成 | 生成 package、Config schema、Tool、bundle patch、Loader/HMR 测试、项目契约、双 Agent 入口和 DSH lock。 |
| `stable`/`edge` 基线治理 | 完成 | 新官方版本只进入 `edge`；Registry 与完整验证均通过后才允许提升为默认 `stable`。 |
| 官方包与 Skill 同步 | 完成 | 每个通道保存完整 workspace package catalog、16 个官方 Skill 的目录信息，以及 2 个产品 Skill 的逐字节快照。 |
| Harness 契约锁定 | 完成 | 校验 tag、version、commit、docs digest、catalog digest、Node/pnpm、attested source inputs 和直连包构建入口。 |
| Harness 路径迁移 | 完成 | 仓库使用 `DSH_HARNESS_BASELINE_ROOT`；生成项目使用 `DSH_HARNESS_ROOT` 并通过 `pnpm context:sync` 同步静态 `link:` 依赖。 |
| 构建、打包与 Profile 验收 | 完成 | 根 e2e 覆盖 strict、unit/HMR、Loader、build、真实 archive 检查以及隔离 profile add/dump/remove。 |
| npm 独立发布 | 阻塞 | 当前 Tool 发布闭包的 23 项检查中 14 个 DSH alpha 包尚未发布；生成项目保持 `private: true` 和 source-linked。 |

## 审计基线

当前 `stable` 与 `edge` 都指向同一个已审计官方 tag；这是双通道机制的
初始种子状态，不代表未来升级可以直接改写 `stable`。

| 字段 | 值 |
|---|---|
| DeepSeek Harness | `0.1.2-alpha.1` |
| 官方 tag | `dsh-v0.1.2-alpha.1` |
| Git commit | `cd5ef8148158c3a752a658978873241fdf8e2bbc` |
| Node engine | `^22.19.0 || >=24.0.0` |
| Package manager | `pnpm@11.7.0` |
| Docs SHA-256 | `80f2fb6fc17b9d071a7985ae331ccd6cec0be637d53916c574f92fdce1b75c07` |
| Catalog SHA-256 | `d957d2c087f3a3ecb946acdfeec7b6d0511f57516326d7259c3a931f6fdbc141` |
| Workspace packages | 264 |
| 官方 Skills | 16（其中 2 个产品 Skill 保存完整快照） |
| 仓库本地解析变量 | `DSH_HARNESS_BASELINE_ROOT` |
| 仓库默认相对位置 | `../deepseek-harness-baseline` |
| 生成项目解析变量 | `DSH_HARNESS_ROOT` |

当前验证使用由 lock 的 sibling fallback 解析出的干净 detached baseline
worktree。这个相对位置不是跨机器的固定契约；其他环境应设置
`DSH_HARNESS_BASELINE_ROOT`。

## 官方 Skill 的用途边界

官方 Harness 中的 Skill 分三类处理：

- `cordis-plugin-development` 与 `editing-cordis-compositions` 是产品运行时
  Skill。仓库按版本保存快照用于溯源和漂移检测，但只有运行环境同时提供
  `cordis_inspect_*`、`cordis_define`、`cordis_run` 等工具时才能直接执行。
- 上游 maintainer Skill 服务于 Harness 仓库自身的贡献、测试或发布流程，
  不会因为存在于源码树中就自动成为外部 DSH 插件开发工作流。
- fixture 中的 Skill 是测试数据，不属于应安装或同步到用户级目录的能力。

本项目的 canonical `dsh-plugin-dev` Skill 负责从需求到开发、验证和交付；
官方 Skill 快照负责上游一致性证据，两者职责不同。

## 架构与权威入口

```text
AGENTS.md / CLAUDE.md
          |
          v
docs/agent/PROJECT_CONTRACT.md + TODO.md
          |
          v
skills/dsh-plugin-dev/SKILL.md
          |
          +-- references/        按任务类型渐进加载的 DSH 契约
          +-- scripts/assets     确定性生成器与模板
          `-- baseline workflow  clean tag -> edge -> verify -> promote
                    |
                    v
           generated DSH project
                    |
                    v
        strict -> test -> build -> pack -> profile
```

维护时优先查看：

- [`PROJECT_CONTRACT.md`](PROJECT_CONTRACT.md)：仓库永久规则与产品边界；
- [`TODO.md`](../../TODO.md)：唯一实时工作队列；
- [`SKILL.md`](../../skills/dsh-plugin-dev/SKILL.md)：DSH 工作流与按形态路由；
- [`BASELINE_UPGRADE.md`](BASELINE_UPGRADE.md)：官方版本升级、验证和提升操作手册；
- [`references/`](../../skills/dsh-plugin-dev/references/)：Tool、Service、Client、LLM、运行时能力、打包、Agent Team 与基线升级知识；
- [`create-project.mjs`](../../skills/dsh-plugin-dev/scripts/create-project.mjs)：确定性 Tool 生成器；
- [`ACCEPTANCE.md`](ACCEPTANCE.md)：仓库与空目录验收口径；
- [`ARCHITECTURE.md`](ARCHITECTURE.md)：发现、分发、生成和 source-linked 架构；
- [`0004-baseline-channels.md`](../decisions/0004-baseline-channels.md)：双通道与提升门禁决策。

不要把共享政策复制到 `AGENTS.md`、`CLAUDE.md` 或两个 repository Skill
adapter 中。它们只负责发现 canonical sources。

## 新维护者启动步骤

环境要求：满足 `^22.19.0 || >=24.0.0` 的 Node，并使用锁定的
`pnpm@11.7.0`。

```sh
git clone git@github.com:benz-ai-x/dsh-plugin-dev.git
cd dsh-plugin-dev
pnpm install
export DSH_HARNESS_BASELINE_ROOT=/absolute/path/to/clean-tagged-harness
pnpm context:check
pnpm context:check:strict
pnpm verify
```

Strict gate 会拒绝：

- 与所选通道不同的 Harness tag、version、commit、docs digest 或工具链；
- catalog 或产品 Skill 快照与上游不一致；
- tracked/non-ignored Harness 变更；
- 会被 source CLI 加载的 ignored 根 `.env`；
- 直接链接包缺失或明显过期的 `main`/`types` 构建入口。

Ignored dependency/build output 可以存在。构建新鲜度只使用 mtime guard，
不是 content-addressed attestation。

## Harness 版本升级

不要直接修改 `stable`。按
[`BASELINE_UPGRADE.md`](BASELINE_UPGRADE.md) 执行：

```sh
# 在官方 tag 上建立并构建干净 detached worktree 后：
DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree pnpm upstream:scan
DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree pnpm upstream:update
pnpm upstream:diff

DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree \
  pnpm upstream:check -- --channel edge
DSH_HARNESS_BASELINE_ROOT=/path/to/clean-worktree pnpm baseline:verify
pnpm registry:check -- --channel edge

# 仅当 edge verification=passed 且 registry=ready：
pnpm baseline:promote
pnpm release:preflight
```

`upstream:update` 只写 `edge`，并把旧的 Registry/verification 证据重置为
未验证。需要审查 stable-to-edge diff，更新受影响的 contracts、references、
templates、tests 和迁移说明，再跑完整验证。现有生成项目必须显式迁移，
不能静默改 lock、`link:` 依赖或业务实现。

## 安装与空目录使用

将同一个 canonical Skill 安装给两个 Agent：

```sh
pnpm install:skill
```

也可以单独执行 `pnpm install:codex` 或 `pnpm install:claude`。

Codex 空目录调用：

```text
使用 $dsh-plugin-dev 创建一个 DSH Tool 插件。
它接收仓库路径，查找超大文件并返回结构化报告。完成实现和验证。
```

Claude Code 空目录调用：

```text
/dsh-plugin-dev 创建一个 DSH Tool 插件。
它接收仓库路径，查找超大文件并返回结构化报告。完成实现和验证。
```

生成器只负责可靠 baseline。Agent 必须继续把参数、canonical output、
executor、Config、测试、README 和 TODO 改成真实业务行为，不能把示例
normalizer 当作完成品。

## 当前验证证据

2026-08-30，当前内容已通过：

- `stable` strict：210 checks，0 warnings；
- `edge` strict：210 checks，0 warnings；
- repository unit：20/20；
- empty-directory e2e：1/1；
- e2e 内生成项目：strict、2 个 Vitest 文件/9 tests、Loader、build、真实
  archive 检查、隔离 profile add/dump/remove 全部通过；
- `stable` 与 `edge` 的 `baseline:verify` 报告均为 `passed`；
- stable-to-edge diff 当前无契约差异；
- 仓库打包 dry-run：50 entries，通过且未生成残留 `.tgz`；
- `git diff --check`：通过。

Registry closure 报告也已持久化：23 项检查中 9 项可用、14 项阻塞。
因此 `baseline:promote` 与 `release:preflight` 会按设计拒绝执行；这是正确的
发布门禁结果，不影响 exact-source 开发验证。

## 必须保留的边界

- 当前确定性生成器只支持 `tool`。Service、Client、LLM 或 Agent Team
  需求不得伪装成 Tool 模板。
- Namespace function plugin 使用 named exports，不能在旁边添加
  `export default apply`。默认导出 Service class 时，`inject` 和 `Config`
  必须放在 class static metadata 上。
- `run_code` 是 Tool registry 保留名称。
- Stock pinned Harness 没有外部 Session event runtime registration surface。
  外部插件不能仅靠 declaration merging 新增可持久事件。
- Generated Remote stream method 只打开一次 logical stream。跨 physical
  carrier generations 的连续性由 `ctx.remote.$stream()` 监督。
- 产品 Skill 快照不等于运行时工具可用，也不应复制成第三套 canonical
  开发政策。
- Source-linked 验证不代表 npm publication readiness，也不证明普通
  Registry 安装闭包成立。

## 剩余工作与建议顺序

以 [`TODO.md`](../../TODO.md) 为唯一实时状态。当前建议顺序：

1. 完成 packaged Codex Plugin/local marketplace 的安装、发现、重装和语义
   smoke，关闭 P3 最后一个未完成项；
2. 建立 local marketplace fixture 与 repository release/version/cachebuster
   流程；
3. 增加 Service provider/consumer 确定性脚手架；
4. 增加 Host/Client 确定性脚手架；
5. 增加 LLM adapter 确定性脚手架；
6. 最后处理 Agent Team、library-only 和独立 npm 发布模式。

推荐下一位维护者先做第 1 项，先证明 packaged Plugin 分发链，再扩大模板
维护面。

## 常见故障

| 现象 | 含义与处理 |
|---|---|
| `DSH_BASELINE_TAG_MISMATCH` / `CATALOG_DRIFT` / `SKILL_MISMATCH` | clean worktree 与通道的 tag、catalog 或产品 Skill 快照不一致；停止，不要套用该通道契约。 |
| `DSH_BASELINE_SOURCE_DIRTY` | 清理/重建 tagged worktree，并移除 Harness 根 `.env`；不要删除所需的 ignored 构建产物。 |
| `DSH_SCAFFOLD_HARNESS_ARTIFACT_MISSING` / `STALE` | 用 lock 记录的 pnpm 版本在 baseline worktree 重装并执行 `build:official`。 |
| `DSH_BASELINE_PREFLIGHT_BLOCKED` / `REPORT_STALE` | Registry、verification 或项目 digest 门禁未就绪；查看通道内持久化报告，不要绕过。 |
| `DSH_SCAFFOLD_HARNESS_MISMATCH` | 生成项目 checkout 与自身 lock 不一致；停止开发并显式迁移。 |
| Harness 目录移动后 link 仍指向旧位置 | 在生成项目运行 `DSH_HARNESS_ROOT=/new/path pnpm context:sync`。 |
| 生成器拒绝目标目录 | 目标不是空目录、发生输出 collision，或 Tool 名为保留的 `run_code`。 |

## 交接完成标准

接手者应能独立完成以下动作：

1. 解释本仓库是 DSH 插件开发工具，而不是 DSH runtime plugin；
2. 找到 canonical Skill、权威契约、实时 TODO、双通道 lock 与 baseline catalog；
3. 解释官方产品 Skill 快照和本项目 canonical Skill 的职责差异；
4. 在 strict gate 通过后运行 `pnpm verify`；
5. 给 Codex 与 Claude Code 安装同一套 Skill；
6. 在空目录生成 Tool baseline，并继续实现真实业务行为；
7. 按 runbook 把新官方版本放入 edge、审查差异、验证并有条件提升；
8. 明确说明当前 source-linked/private 限制，不宣称 npm 已可独立发布；
9. 从 P3 packaged Plugin/local marketplace smoke 继续推进。
