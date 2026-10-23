# QQBot-EX

> 仓库：<https://github.com/OkliaoliO/QQBot-EX>

给 [`@tencent-connect/dsh-qqbot`](https://github.com/tencent-connect/dsh-qqbot) 加上「新对话工作区」的 EX 分支。

基于上游 **0.5.2**，保留 QQ 私聊/群聊、扫码绑定、流式输出、富媒体、视觉理解、附件发送、`/new` `/compact` `/model` `/preset` 等全部能力；额外解决 QQ 会话在 DSH 侧栏总是落到「未分类」的问题，并让新对话可以固定进入指定工作区。

> QQBot-EX 不是腾讯或 DeepSeek 的官方发布，只是基于 MIT 许可的上游代码做的 fork。

---

## 为什么需要它

DSH 的工作区归属由两层共同决定：

1. **session header 的 `cwd`**：决定会话属于哪个目录；
2. **工作区账本（`workspace.json` 的 `sessionIds`）**：决定会话是否显示在该工作区下。

上游 QQ 插件用宿主进程的 `cwd`（Desktop 下是 `~/.dsh/profiles/desktop`）创建会话，并且直接调用 `agents.create`，绕过了 GUI 的 `sessionController.create`：

- 会话不匹配任何工作区目录；
- 也没有人调用 `workspace.attachSession()` 把它登记进工作区账本。

结果就是侧栏里的「未分类」。仅把 `cwd` 改成工作区目录也不够：会话必须显式 attach，且旧会话的 header `cwd` 不会因为配置变化而改变，所以会一直 resume 旧 session。

QQBot-EX 把这三件事一起处理了。

---

## 新增能力

### 1. `workspace` 配置

```yaml
- id: im-qqbot
  config:
    workspace: /Users/you/Documents/deepseek-harness/MyWorkspace
```

- 新会话以 `workspace` 为 `cwd`（未设置时仍回落到 `cwd` / 进程 cwd）；
- 目录不存在会递归创建，并通过 `ctx.workspaceRegistry.create()` 登记为工作区；
- 新会话创建/恢复后调用 `attachSession()`，进入工作区账本；
- 支持 `~` 展开；相对路径按宿主进程 cwd 解析。
- 设置页：**设置 → QQ 机器人 → 工作区 → 新对话所在工作区**。

### 2. 工作区变更后自动换新会话

配置的 `workspace` 与当前会话 header 的 `cwd` 不一致时，该 peer 的下一条消息会：

1. 丢弃旧会话（旧 session 日志保留，不删除）；
2. 轮换 per-peer sessionId（写入 `~/.dsh-qqbot/model-prefs.json`）；
3. 以新工作区为 `cwd` 创建新会话并 attach。

因此不会再出现「改了 workspace 但下一条消息还继承旧 session」的情况。旧会话会留在侧栏（未分类或原工作区），可以手动归档。

### 3. 本地/链接安装兼容

`getProfileDir()` 优先读取 `DSH_PROFILE_DIR`。dsh 启动 profile 时会设置该变量，所以用本地路径、`link:` 或 `file:` 方式安装时，扫码凭据仍能写回正确的 profile，而不是因为插件目录不在 `node_modules` 下而定位失败。

---

## 安装

### 前置：先移除上游 QQ 插件

QQBot-EX 与上游都使用 row id `im-qqbot`。同时安装会重复注册网关和路由。安装前请先：

- 在 **设置 → 插件** 里禁用/卸载 `@tencent-connect/dsh-qqbot`；或
- 使用 Plugin Manager 移除该 bundle。

### 方式一：从本地目录安装（推荐）

```bash
# 把 QQBot-EX 放在任意目录，然后在 DSH profile 中安装
npx @deepseek-ai/dsh plugin --profile desktop add /path/to/QQBot-EX
```

或者在 DSH 的 **设置 → 插件** 里用 Plugin Manager 安装本地目录；安装目标就是本仓库根目录（包含 `package.json` 与 `cordis.patch.yml`）。

### 方式二：从 Git 仓库安装

```bash
npx @deepseek-ai/dsh plugin --profile desktop add git+https://github.com/OkliaoliO/QQBot-EX.git
```

> 仓库里已经提交了构建产物（`dist/`、`lib/`），安装时不需要再构建。

### 首次启动

1. 启动/重载后，插件检测到没有 AppID/AppSecret，会进入扫码绑定流程；
2. 在 **设置 → QQ 机器人** 扫码，或手动填写 AppID/AppSecret；
3. 绑定成功后插件自动重载；如果配置了 `workspace`，新会话会直接进入该工作区。

---

## 配置

### 新增字段

| 配置 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `workspace` | string | - | 新对话所在工作区目录（绝对路径，支持 `~`）；留空回落到 `cwd` |

### 常用字段（与上游一致）

| 配置 | 默认值 | 说明 |
|---|---|---|
| `appId` / `appSecret` | - | QQ Bot 凭据；推荐扫码绑定，由插件写入 profile patch |
| `provider` / `model` / `preset` | 继承宿主 | LLM 路由与 agent preset |
| `cwd` | `process.cwd()` | `workspace` 未设置时的 Agent 工作目录 |
| `requireMention` | `true` | 群聊是否需要 @bot |
| `streaming` | `true` | 流式输出（群聊始终关闭） |
| `sessionIdleTimeout` | `1800000` | 会话闲置回收时间(ms) |
| `maxQueue` / `processingTimeoutMs` | `20` / `1800000` | 并发队列与处理超时 |
| `access.c2cMode` / `access.groupMode` | `open` | `open` / `allowlist` / `disabled` |
| `debug` | `false` | 调试日志 |

### profile patch 示例

```yaml
- id: im-qqbot
  config:
    workspace: /Users/you/Documents/deepseek-harness/MyWorkspace
    requireMention: true
    access:
      c2cMode: open
      c2cAllow: []
      groupMode: open
      groupAllow: []
```

修改 `workspace` 后保存会触发插件重载；该 peer 的下一条消息会自动换到新工作区的新会话。

---

## 工作区行为

| 场景 | 行为 |
|---|---|
| 首次对话 / `/new` | 在 `workspace` 下创建新会话并 attach |
| 已有会话，且 header `cwd` 与 `workspace` 一致 | 正常 resume，不换会话 |
| 已有会话，但 header `cwd` 与 `workspace` 不一致 | 下一条消息自动换新会话（旧会话保留） |
| 未配置 `workspace` | 完全保持上游行为：`cwd` / 进程 cwd，可能显示为未分类 |
| 目录不存在 | 自动 `mkdir -p` 并登记为工作区，标题取目录名 |

**旧会话不会被删除。** 自动换会话只是让机器人之后写入新会话；旧日志仍在侧栏，可随时查看或归档。

---

## 与上游的差异

已修改文件：

- `dist/config.js` / `dist/config.d.ts`：新增 `workspace` 配置；
- `dist/session/session-manager.js`：`effectiveCwd()`、`attachToWorkspace()`、工作区不一致自动换会话；
- `dist/gateway/bootstrap.js`：启动时解析目录、`workspaceRegistry.create()` 登记、注入工作区实体；
- `dist/setup/bind-routes.js`：设置页配置路由允许读写 `workspace`，GET 回显生效 `cwd`；
- `dist/shared/utils.js`：`getProfileDir()` 优先使用 `DSH_PROFILE_DIR`；
- `lib/client.js`：设置页新增「新对话所在工作区」输入框。

完整 diff 见 [`patches/qqbot-ex.patch`](patches/qqbot-ex.patch)。

未修改：网关协议、消息中间件、QQ SDK 调用、命令、媒体/视觉/附件能力、扫码绑定流程。

---

## 维护 / 跟进上游

本仓库是**构建产物 fork**，没有提交 TypeScript 源码。跟进上游版本的步骤：

1. 取得新版 `@tencent-connect/dsh-qqbot` 的包目录（例如 `npm pack` 后解压）；
2. 运行 `node scripts/rebase.mjs <upstream-package-dir>`，把 EX 改动重放到新 `dist/`、`lib/`；
3. 把生成的 `dist/`、`lib/` 覆盖到本仓库；
4. 运行 `node scripts/verify.mjs` 检查；
5. 重新生成 `patches/qqbot-ex.patch`。

`scripts/rebase.mjs` 的锚点按 0.5.2 编写。上游结构变化较大时脚本会拒绝写入并报错，不会写坏文件。

仓库不包含 `*.map`：上游 source map 不反映 EX 改动，保留反而会误导调试。覆盖 `dist/`、`lib/` 后请删除新生成的 `.map`（或从 `package.json.files` 中排除）。`patches/qqbot-ex.patch` 只包含可执行代码差异，已验证可把 0.5.2 原包还原成本仓库的代码。

### 验证

```bash
node scripts/verify.mjs
```

检查 package 元数据、bundle/client 声明、所有 JS 语法，以及 EX 关键代码标记。

已用临时 profile 做安装验收：`dsh plugin --profile <test> add ./dsh-qqbot-ex-0.5.2-ex.1.tgz` 能正确写入 bundle 列表，`--dump-config` 中 `im-qqbot` 的 `name` 为 `dsh-qqbot-ex`，配置中带 `workspace: ''` 默认值。

---

## 兼容性与限制

- 基于上游 `0.5.2`，在 **DSH Desktop 0.2.1-rc.2** 上验证：扫码绑定、配置重载、会话按 workspace 归组；工作区变更自动换会话由单元测试覆盖（真实 QQ 消息待验收）。
- 客户端设置页的新输入框是构建产物修改，**需要刷新页面**才能看到；宿主侧配置始终可通过 profile patch 生效。
- 自动换会话会**重置对话上下文**（旧会话仍保留）；如果希望保留上下文，可以改为 fork 迁移，但 fork 会带旧 session 的父级关系，可能仍显示「继承」标记。
- 本地路径/`link:` 安装依赖 `DSH_PROFILE_DIR`；如果宿主没有设置该变量，请把本包放进 profile 的 `node_modules` 下安装。
- 不是腾讯/DeepSeek 官方发布；QQ Bot 平台侧的限制（被动回复条数、主动消息额度等）与上游一致。

---

## 许可证

MIT。上游版权：Copyright (c) 2026 Tencent Connect；EX 修改：Copyright (c) 2026 QQBot-EX contributors。

详见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。
