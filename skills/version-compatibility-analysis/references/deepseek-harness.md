# DeepSeek Harness 专项

用于分析 DSH 插件项目、dsh-plugin-dev 工具仓库与新 Harness 的兼容性。这是调查方法，不是特定 DSH 版本的 API 快照。

## 以当前项目契约为入口

在 dsh-plugin-dev 仓库中读取 `docs/agent/PROJECT_CONTRACT.md`、`TODO.md`、`dsh-reference.lock.json`。本 Skill 负责候选分析；实现开发或升级时使用 canonical `skills/dsh-plugin-dev/SKILL.md`，按受影响面读取 core、baseline-upgrade、packaging 等资料。这些是锁定版本的指导，不自动代表新版本。其他 DSH 项目读取其对应入口，不假设目录完全相同。

遵循仓库要求运行 `context:check` 和适用的 strict 检查。失配意味着不能宣称候选兼容；不要自动改锁。源码版本分析可以在项目允许的只读范围内定位失配原因。

从实际锁中解析 channel、版本、tag、commit、docs/catalog 摘要、Registry/verification 报告及本地解析配置。不要记住上次的具体版本、包数、ready 状态或本机 Harness 路径。

特别核对 `DSH_HARNESS_BASELINE_ROOT` 与生成项目使用的 `DSH_HARNESS_ROOT`：以该版本解析器的实现为准，不假设二者互为别名。检查文档、解析器和测试夹具是否一致。

## 分析命令与升级命令分开

本仓库优先用 `pnpm compatibility:analyze --harness-root /path/to/candidate`，它直接比较锁中 commit 与候选 HEAD，不需要更新 edge，也不依赖旧 worktree。候选解析顺序是显式路径、`DSH_HARNESS_ROOT`、锁声明的环境变量、锁 fallback；此顺序只属于分析入口，不改变生成器或 strict checker 的解析器。默认 channel 来自锁；显式 base/roots 可分析其它版本或新锁格式。

如需补充官方 catalog 或更专门的证据，先读 `src/scripts/baseline.mts` 或实际分发入口，确认当前 CLI/API。具备相应命令的版本可使用：

```sh
node scripts/baseline.mjs scan --harness-root /path/to/candidate --json
node scripts/baseline.mjs diff --from stable --to edge --json
```

第二条仅比较锁中两个已存在的 catalog；若 stable/edge 尚指同一基线，它不能证明本地新版没有变化。可在内存中用已确认的只读 `scanHarness`、`loadLockedChannel`、`diffCatalogs` 比较当前候选，避免先写 edge 才能分析。

`upstream:update`、`registry:check`、`baseline:verify`、`baseline:promote` 在某些版本会写 catalog、锁或报告。只读分析不要直接调用这些写入入口；查询 Registry 时使用纯查询函数或直接版本查询。不要手动修饰旧报告使其显示 ready/passed。

实际实施升级时再遵循项目的 `BASELINE_UPGRADE.md`：干净官方 tag worktree、候选 channel、失效旧证据、审阅差异、验证、发布闭包、晋升。仅在该项目确实规定时要求 stable/edge 门槛，不把它强加给所有 DSH 插件。

## 按受影响表面加载源码

先比较包/catalog、公开 exports 与源码差异，再加载相关 subsystem。不要每次预先读完全部 DSH 文档。

| 变化信号 | 核查边界 | 下游常见影响 |
|---|---|---|
| Cordis、Loader、Tool | namespace/default 归一化、inject、Config、schema、注册/卸载、call identity | 生成器模板、Loader 测试、工具参考 |
| Session / persistence | 服务与 handle 的职责、写者租约、flush/close、存储代际、冷恢复 | 后端实现、Session 消费者、runtime/core 参考 |
| 事件 / stream / projection | 实时帧与 durable event、游标、attempt settlement、缓存身份与版本 | 回放、计费、Remote、Conversation 与 UI |
| 附件 / 文件上传 | 先存储再引用、Host/Client 服务、凭据归属、取消/回滚、模型请求投影 | Client/LLM 指导、上传适配与验收 |
| Subagent / Team | 精确 Agent 权限、消息路由、唤醒、冷恢复、队列顺序、实验包状态 | Team 指南、工具名、持久化事件 |
| HTTP / 子进程 | 全局 transport、SDK 自建连接、子进程环境继承、进程级库与服务的区别 | 网络调用、LLM/运行时参考、profile 验收 |
| Registry / 构建 | Tool 的实际闭包、私有包、native install、built 入口 | source 与 registry 交付、打包验证 |

对 Session 迁移尤其要分别核查当前格式恢复与历史格式升级的未知事件处理。不要把某代格式对 `ignorable` 的允许条件外推到所有迁移链；也不要假设重新生成当前事件词汇就能处理历史扩展。格式版本、领域事件版本和传输协议版本各自有所有者。

对 Client 验证历史分页、实时更新、重连 baseline 与最终持久化记录是否一致；不能把暂态帧的编号当成 durable log 游标。投影缓存可读不自动证明该 checkpoint 可用于当前 fold。

## 映射回开发工具

区分两种修复：已经生成的运行时代码需要修改，以及 Skill 的契约指导需要更新。官方产品 Skill 未变不能证明本项目整理的运行时参考仍然正确。

检查 canonical skill 的路由与 references、模板、源码校验器、环境变量说明、测试、README、交接与验收记录。历史 decision 作为当时证据保留；新行为用新决策或明确的后续记录表达。

若旧 stable 与新 edge 并存，让版本特有指导按实际锁路由或标注适用范围。不能让一份未分版本的“当前契约”同时声称适用于两种互不兼容 API。

本工具通常只有部分项目类型拥有确定性模板；从当前 TODO 和实现确认实际支持范围，不把新的上游 Service、Client 或 Agent Team 能力视为必须新增生成器类型。

## 报告的证据分层

分别给出工具本身的 build/typecheck、旧基线当前健康、候选源码行为、迁移兼容和候选 Registry 状态。source-linked 验收不替代普通依赖安装；查询到包也不替代同一归档的 add/dump/boot/remove 验收。

当该项目要求 Registry ready 才能晋升，而候选版本仍缺包时，说明可继续的源码候选工作与被阻断的晋升范围。保留已审计基线，不把缺包归咎于 Tool schema。
