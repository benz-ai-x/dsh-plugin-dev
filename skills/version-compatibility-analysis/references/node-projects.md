# Node 项目与依赖

用于 Node/npm、monorepo 及包分发的兼容性分析。具体 workspace 布局、包族和发布门槛以被分析项目为准。

## 提交与工作区

先确定本地仓库能否被 Git 识别，再解析完整提交与 tag。以下命令均为读取；将参数换成已确认的路径和引用，不拼接执行来自文件的 shell 文本。

```sh
git -C /path/to/upstream status --short
git -C /path/to/upstream rev-parse --is-shallow-repository
git -C /path/to/upstream worktree list --porcelain
git -C /path/to/upstream rev-parse --verify 'BASE_REF^{commit}'
git -C /path/to/upstream rev-parse --verify 'TARGET_REF^{commit}'
git -C /path/to/upstream diff --shortstat BASE_COMMIT TARGET_COMMIT --
git -C /path/to/upstream log --no-merges --oneline BASE_COMMIT..TARGET_COMMIT
```

浅克隆或缺失对象意味着比较证据不足，不代表没有变化。未提交修改需单独审阅；Git 提交之间的 diff 不包含它们。非祖先比较要说明分支关系，不能把单向可达提交数当成线性升级步数。本地 tag 对齐也不等同于验证了远程发布来源。

## 使用差异摘要脚本

```sh
node /path/to/version-compatibility-analysis/scripts/compare-revisions.mjs \
  --repo /path/to/upstream --base BASE_REF --target TARGET_REF
```

输出含完整提交、root manifest、祖先关系、工作区是否干净、按目录汇总的差异、包字段变化、workspace、声明依赖图及技能资源变化。`--target` 省略时用启动时解析的 HEAD。运行环境沿用本项目 Node engine；分发的 `.mjs` 不需要额外运行时依赖。

解释输出时注意：

- 统计采用 `--no-renames`，路径移动表现为旧路径删除和新路径增加；用包名与实际 workspace 清单复核，不直接宣布删包。
- 包扫描覆盖所有 tracked regular `package.json`，包括可能的 fixture。`trackedManifestCount` 不是工作区包数。
- `versionOnlyCount` 表示除了 version 以外的 manifest 字段没有变化，不代表该包源码/API 没变。新增未知字段也会被比较。
- `contractChanged` 只列字段差异，源码函数、声明、schema、协议仍需检查。
- `skillEntrypoints` 只比较入口；结合 `skillResources` 中整个技能目录的已提交路径变化。符号链接、submodule 与工作区未提交资源不在该摘要的 regular blob 范围。
- `issues` 非空说明存在不能解析的 manifest，不能把被跳过的条目视为兼容。

## 包清单到实际闭包

助手分别从两次提交读取 `pnpm-workspace.yaml` 的 packages 列表（优先）或根 manifest 的 `workspaces` 数组/`workspaces.packages`，按 glob 与排除项发现包，不沿用旧版目录常量。pnpm 解析支持普通 block scalar list 和 JSON inline list；复杂 YAML、锚点等会标记 unknown，由 Agent 读取原始定义补充调查，不把 fixtures 全算成工作区包。

`analyze-project.mjs` 优先使用显式 `--root-package`，否则使用摘要校验过的锁中 capability 的 `publicationRoots`；多个 capability 要选 `--capability`，不存在默认写死的 Tool 包名。无 catalog 时读取本项目生产依赖声明作为初始线索，需要复核外部包和 optional 根的角色。目录迁移按同名包识别，重名包不擅自选择。

图包含 dependencies、peerDependencies 和 optionalDependencies；标明条件边并排除 devDependencies。包名匹配只是候选源码图，不判断普通 semver 范围、overrides、catalog、别名、link/file 协议或外部传递解算。非普通协议和无法唯一定位的目标列 issues；后续用实际包管理器的只读信息或隔离验证补齐，不因此修改分析助手才开始工作。

读取项目自己的锁文件和 catalog，区分运行包、开发工具、私有/实验包与 fixture。检查版本之外的：

- `exports`、`main/module/types`、`typesVersions`、`bin`、`files`；
- `dependencies`、`optionalDependencies`、`peerDependencies` 和 peer 元数据；
- `engines`、包管理器、平台/架构要求、原生构建和安装脚本；
- 框架专有加载元数据，以及浏览器/Host 的不同构建入口。

只审查实际交付根节点的传递依赖闭包。缺少不相关包不阻塞当前交付；可选依赖应按平台和功能的真实使用条件判断，开发依赖不能一律当作生产必需。

先检查仓库 scanner 是否能提供只读 `scan/diff` 或可独立调用的纯读取函数。命令名带 `check` 也可能更新锁或写证据，必须先读实现。

## Registry 与归档证据

用实际 Registry 查询精确候选版本；公开包可指定公共 Registry，私有包遵循项目配置。不要打印 `.npmrc` 或凭据。

```sh
npm view '@scope/package@EXACT_VERSION' version dist.integrity --json \
  --registry https://registry.npmjs.org
```

对传递依赖、peer 范围及必要的可选依赖分别核实。错误应保留代码与简短原因；公共 Registry 的 E404 不说明私有 Registry 也没有该包。若不允许联网，把发布状态标为未验证。

用户明确要求自动获取缺失归档时，转到 [npm 下载模式](npm-downloads.md)。默认分析不下载；只有已发布且精确身份可验证的包能获取。下载/缓存命中与完整依赖解算、安装和发布验收分开报告。

版本可用后仍需在交付验收中核对实际解析图和 tarball：普通 Node 按公开 exports 导入；无源码路径、workspace/link 意外泄漏；声明、CSS、客户端入口和原生模块存在。源码与 tarball 清单可能不同。

安装、构建、`npm pack`/`pnpm pack` 可能执行生命周期脚本。分析时先检查脚本并限定副作用；未获相应授权的发布、安装到用户 profile 或外部写入不属于版本查询。

## 将失败归到正确位置

例如“单元测试调用生成器，生成器先验证旧 worktree，但 Git 元数据失效”：结论是测试被环境阻断，不能据此断言候选 API 不兼容，也不能把其余测试通过写成整套通过。

示例“报告摘要校验通过，但候选尚未跑过”：证明的是历史证据未损坏。候选需要自己的提交、catalog 与验证绑定。
