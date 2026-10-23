# QQBot-EX

> 基于 [`@tencent-connect/dsh-qqbot`](https://github.com/tencent-connect/dsh-qqbot) `0.5.2` 的 DSH QQ 机器人插件 fork。
> QQBot-EX 不是腾讯或 DeepSeek 的官方发布，只是基于上游 MIT 许可代码做的定制分支。

上游插件负责把 QQ 和 DSH 接起来：私聊/群聊、扫码绑定、流式输出、富媒体、视觉理解、附件发送、`/new` `/compact` `/model` `/preset` 等命令都原样保留。
本仓库在上游之上加了四件事：

| 能力 | 说明 |
|---|---|
| **工作区归属** | 每个 QQ 对话固定落在指定目录，不再全部落到「未分类」 |
| **换行分条** | 一条回复按换行拆成多条 QQ 消息（最多 4 条），聊天更像真人 |
| **`qqbot_send_text`** | 可选工具，在回复之外手动补发一条独立消息 |
| **安装兼容** | 本地/`link:`/`file:` 安装时也能正确定位 profile |

---

## 功能

### 1. 新对话落在指定工作区

DSH 的工作区归属由两层决定：

1. 会话 header 的 `cwd`；
2. 工作区账本（`workspace.json` 的 `sessionIds`）。

上游用宿主进程的 `cwd` 创建会话，并直接调用 `agents.create`，绕过 GUI 的 `sessionController.create`：会话不匹配任何工作区目录，也没人把它登记进工作区账本，于是侧栏显示「未分类」。

配置 `workspace` 后：

- 新会话以该目录为 `cwd`（未设置时回落到 `cwd` / 进程 cwd）；
- 目录不存在会递归创建，并通过 `ctx.workspaceRegistry.create()` 登记为工作区；
- 新会话创建/恢复后调用 `attachSession()`，进入工作区账本；
- 支持 `~` 展开；相对路径按宿主进程 cwd 解析。

配置的 `workspace` 与现有会话 header 的 `cwd` 不一致时，该 peer 的下一条消息会自动换新会话（旧会话保留，不删除）。

### 2. 回复按换行自动分条

上游一条回复只发一条 QQ 消息。本分支在出站处按**换行**拆分：

- 每个非空行是一条消息；
- 空行只作分隔；
- 用三个反引号围起来的代码块整块保留，不会被拆散；
- 最多 **4 条**，多出来的合并到最后一条。

```text
你怎么现在才回我呀
我等你好久了
算了，回来就好
```

上面三行会变成三条气泡。

> ⚠️ 需要 `streaming: false`。流式输出时文字是边生成边更新的单条消息，无法拆分。

拆分逻辑在 `dist/transport/split-bubbles.js`，由 `dist/transport/outbound.js`（静态路径）和 `outbound-buffer.js`（缓冲/降级路径）调用。

### 3. `qqbot_send_text`（可选）

需要在正文之外补一条消息时，可让模型调用内置工具 `qqbot_send_text(text)`：

- 立即把一段文本作为一条独立 QQ 消息发出；
- 每条用户消息最多调用 **3 次**；
- 走插件 `sender`，带 msgId 兜底与被动回复限额管控；
- 只在 QQ 会话内可用，其他会话返回「无法确定发送目标」。

一般场景用换行分条就够了，这个工具是补充。

### 4. 本地/链接安装兼容

`getProfileDir()` 优先读取 `DSH_PROFILE_DIR`。dsh 启动 profile 时会设置该变量，所以用本地路径、`link:` 或 `file:` 方式安装时，扫码凭据仍能写回正确的 profile，而不是因为插件目录不在 `node_modules` 下而定位失败。

---

## 安装

### 前置：先移除上游 QQ 插件

QQBot-EX 与上游都使用 row id `im-qqbot`，同时安装会重复注册网关和路由。安装前请在 **设置 → 插件** 里禁用/卸载 `@tencent-connect/dsh-qqbot`，或通过 Plugin Manager 移除。

### 方式一：从 Git 仓库安装（推荐）

```bash
npx @deepseek-ai/dsh plugin --profile desktop add git+https://github.com/OkliaoliO/QQBot-EX.git
```

### 方式二：从本地目录安装

```bash
npx @deepseek-ai/dsh plugin --profile desktop add /path/to/QQBot-EX
```

也可以在 DSH 的 **设置 → 插件** 里用 Plugin Manager 选择仓库根目录（含 `package.json` 与 `cordis.patch.yml`）。

> 仓库里已提交构建产物（`dist/`、`lib/`），安装时不需要再构建。

### 首次启动

1. 启动/重载后，插件检测到没有 AppID/AppSecret，会进入扫码绑定流程；
2. 在 **设置 → QQ 机器人** 扫码，或手动填写 AppID/AppSecret；
3. 绑定成功后插件自动重载；如果配置了 `workspace`，新会话会直接进入该工作区。

---

## 配置

profile patch 示例：

```yaml
- id: im-qqbot
  config:
    workspace: /Users/you/Documents/deepseek-harness/MyWorkspace
    streaming: false
    requireMention: true
    access:
      c2cMode: open
      c2cAllow: []
      groupMode: open
      groupAllow: []
```

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
| `streaming` | `true` | 流式输出（群聊始终关闭）。**要换行分条就设为 `false`** |
| `sessionIdleTimeout` | `1800000` | 会话闲置回收时间(ms) |
| `maxQueue` / `processingTimeoutMs` | `20` / `1800000` | 并发队列与处理超时 |
| `access.c2cMode` / `access.groupMode` | `open` | `open` / `allowlist` / `disabled` |
| `debug` | `false` | 调试日志 |

修改 `workspace` 或 `streaming` 后保存会触发插件重载；改动 `dist/` 下的代码则需要重启 DSH。

---

## 工作区行为

| 场景 | 行为 |
|---|---|
| 首次对话 / `/new` | 在 `workspace` 下创建新会话并 attach |
| 已有会话，且 header `cwd` 与 `workspace` 一致 | 正常 resume，不换会话 |
| 已有会话，但 header `cwd` 与 `workspace` 不一致 | 下一条消息自动换新会话（旧会话保留） |
| 未配置 `workspace` | 完全保持上游行为：`cwd` / 进程 cwd，可能显示为未分类 |
| 目录不存在 | 自动 `mkdir -p` 并登记为工作区，标题取目录名 |

**旧会话不会被删除**，自动换会话只是让机器人之后写入新会话；旧日志仍在侧栏，可随时查看或归档。

---

## 与上游的差异

| 文件 | 改动 |
|---|---|
| `dist/config.js` / `dist/config.d.ts` | 新增 `workspace` 配置 |
| `dist/session/session-manager.js` | `effectiveCwd()`、`attachToWorkspace()`、工作区不一致自动换会话 |
| `dist/gateway/bootstrap.js` | 解析目录、登记工作区、注入实体；注册 `qqbot_send_text` |
| `dist/setup/bind-routes.js` | 配置路由读写 `workspace`，GET 回显生效 `cwd` |
| `dist/shared/utils.js` | `getProfileDir()` 优先使用 `DSH_PROFILE_DIR` |
| `dist/transport/split-bubbles.js` | **新增**：按换行拆气泡 |
| `dist/transport/outbound.js` / `outbound-buffer.js` | 调用 `splitBubbles()` |
| `dist/text/send-text-tool.js` | **新增**：`qqbot_send_text` 工具 |
| `lib/client.js` | 设置页新增「新对话所在工作区」输入框；`__ModuleLoader__.load` 的 `id` 改为本包名 |

完整 diff 见 [`patches/qqbot-ex.patch`](patches/qqbot-ex.patch)（相对上游 `0.5.2`，可用 `git apply -p1` 打到干净包上）。

未修改：网关协议、消息中间件、QQ SDK 调用、命令、媒体/视觉/附件能力、扫码绑定流程。

---

## 维护 / 跟进上游

本仓库是**构建产物 fork**，没有提交 TypeScript 源码。跟进上游版本时：

1. 拿到上游包目录（`node_modules/@tencent-connect/dsh-qqbot`）；
2. 重放改动：

   ```bash
   node scripts/rebase.mjs <上游包目录>
   ```

   脚本会按锚点改写 `dist/config.js`、`config.d.ts`、`session-manager.js`、`bootstrap.js`、`bind-routes.js`、`shared/utils.js`、`lib/client.js`；锚点不匹配时会拒绝写入。
   ⚠️ 换行分条与 `qqbot_send_text` 是新增文件 + 少量调用，不在此脚本内，需按 `patches/qqbot-ex.patch` 手动补。

3. 自检：

   ```bash
   node scripts/verify.mjs
   ```

   检查 JavaScript 语法、注入的模块 id、版本号一致性等。

4. 重新提交 `dist/`、`lib/` 与 `patches/qqbot-ex.patch`。

---

## 兼容性与限制

- 基于上游 `0.5.2`，在 **DSH Desktop 0.2.1-rc.2** 上验证：扫码绑定、配置重载、会话按 workspace 归组。
- 自动换会话会**重置对话上下文**（旧会话仍保留）；想保留上下文需要迁移，迁移会带旧 session 的父级关系，可能仍显示「继承」标记。
- 本地路径/`link:` 安装依赖 `DSH_PROFILE_DIR`；宿主没设置时，请把本包放进 profile 的 `node_modules` 下。
- 换行分条需要关闭流式；开启时回复仍是单条。
- 被动回复条数、主动消息额度等 QQ 平台侧限制与上游一致；本分支把出站气泡控制在 4 条以内。
- 不是腾讯/DeepSeek 官方发布。

---

## 许可证

MIT，见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。

上游版权归 Tencent 及 `@tencent-connect/dsh-qqbot` 贡献者所有。
