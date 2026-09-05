# 显式 npm 下载模式

用户要求分析时下载缺失包、补齐本地分析用归档或重试先前不可用的精确版本时读取。本模式不是依赖安装器，也不能下载尚未发布或对当前身份不可见的版本。

## 使用

```sh
pnpm compatibility:analyze --harness-root /path/to/deepseek-harness \
  --download-missing --download-dir /path/to/compat-npm-cache \
  --registry https://registry.npmjs.org
```

随 Plugin 分发时用 `node /path/to/skill/scripts/analyze-project.mjs --project /path/to/downstream` 加相同参数，不依赖本仓库脚本别名。`--target`、`--channel`、`--capability` 和可重复的 `--root-package` 仍控制分析范围。缺少 `--download-missing` 时传下载目录或 Registry 会报用法错误，不能意外开启网络与写入。

下载目录的父目录必须存在；目录本身须为尚不存在的新目录，或本助手先前创建的缓存。目录必须在下游项目、Harness 和当前 Skill 之外，符号链接不能绕过检查。重复使用同一目录可复用文件。不要用工作区根、用户主目录或其它已有目录充当缓存，不要为了通过检查给任意目录补标记。

这里的“缺失”指本下载目录内尚无通过校验的对应归档，不是扫描或修补 `node_modules`；本地已有源码或安装目录不等于已缓存 Registry tarball。

运行需要 Node、Git 和本机可用的 npm；不自动安装/升级 npm。Registry 默认为 `https://registry.npmjs.org/`。指定源必须是无凭据、查询参数和片段的 HTTPS URL（本机回环测试源允许 HTTP）。npm 使用已有用户级认证；不会复制或自动加载目标项目的 `.npmrc`，也不会自动登录。项目级私有认证配置不自动继承，应由用户通过正常 npm 认证配置解决；不要将令牌放进命令或报告。每次只使用选定的源，显式覆盖相关 scope 路由，不进行公共/私有/镜像源回退。

## 目标与执行边界

- 每轮从已解析候选 commit 的声明依赖图读取公开 workspace 包的实际精确版本，包含已标注的条件包，以及图中精确版本的外部边。包名、目录、版本和数量不写死；同名同版本去重，required 路径优先于 optional。
- 私有 workspace 包不请求 Registry。范围、tag、alias、Git/file/link/catalog 协议不猜版本；图中无法解析的目标保留 `issues`，非精确版本列入 `deferred`。外部传递依赖、平台选择、版本范围满足关系仍需完整解算。需要这些证据时继续正常依赖分析，不把下载器当安装 solver。
- 先通过 `npm view NAME@EXACT_VERSION` 检查身份与 `dist.integrity`；已存在 tarball 也要重新查询并校验。元数据无法访问时不把缓存当作当前发布可用的证明。
- 缺失归档通过 [`npm pack`](https://docs.npmjs.com/cli/v11/commands/npm-pack/) 获取，始终显式禁用脚本，工作目录和 npm 缓存放在本次独占临时子目录。只接受 Registry 名称加精确版本，不执行本地或 Git 包的打包流程。
- 使用 Registry 提供的最强受支持 SHA-256/384/512 SRI 校验后，独占创建以 Registry、包名和版本的 SHA-256 为文件名的 `.tgz`。现存文件损坏、身份不符、摘要缺失或不支持时拒绝，不覆盖；单归档验收上限为 100 MiB（不是网络流量配额）。
- 不解压、不安装依赖、不执行 prepare/install/postinstall，不构建 native，不改项目清单、lock、node_modules、profile 或 baseline 报告。目录保留校验后的归档和所有权标记，临时 npm 缓存/日志清理；JSON 仅输出到 stdout。报告中的绝对路径用于找到归档，不要仅凭哈希文件名判断包身份。
- 请求顺序执行，单 npm 命令网络超时 15 秒、重试 0 次、进程上限 45 秒；失败记录后继续其它目标。需要重试时再次显式运行，不在后台无限等待发布。

## 输出解释

`downloads` 与只读声明图分开；图的 `registryStatus: not-queried` 描述原始图采集，并未升级成完整发布验证。

| 状态 | 含义与后续 |
|---|---|
| `downloaded` | 本次获取了指定版本归档，`archive` 和 `integrity` 给出位置与校验值 |
| `cached` | 复用已有归档，本轮元数据和字节校验通过 |
| `not-found` | E404/ETARGET：选定 Registry 对当前身份未提供该精确版本；不能通过反复下载修复 |
| `auth-error` | E401/E403/ENEEDAUTH：认证/权限问题，不等同于未发布 |
| `network-error` | 超时、DNS 或连接失败，发布状态未验证 |
| `failed` | 检查 `code`：npm 不可用、存储失败、身份或完整性不符等；原始 npm 日志不进入报告 |

`downloads.status: complete` 只说明非空的本次选定下载范围全部完成且没有待处理项。`partial` 表示仍有失败、deferred 或依赖图缺口，CLI 退出 2；输入错误退出 1。默认分析退出 0 仍只表示证据采集完成。

实际报告必须区分“Registry 缺指定版本”和“本地缓存尚无已发布版本”。下载成功不代表整个依赖图可安装、包安全、API 兼容或可发布；后续仍需精确归档的干净安装/导入、同通道 Loader/profile 验收及审计升级授权。下载器不更新 Registry 报告，更不会把旧的 blocked 改成 ready。
