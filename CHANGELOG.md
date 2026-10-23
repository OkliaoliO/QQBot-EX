# Changelog

本文件记录 QQBot-EX 相对上游 `@tencent-connect/dsh-qqbot` 的变化。

## [0.5.2-ex.5] - 2026-10-23

### 修复

- **分条消息可能乱序 / 语序错乱**：出站改为在 `turn/end` 时把整轮文本一次性按换行拆分，并逐条 `await` 串行发送；此前是在每条 `assistant/message` 到达时并发发送，多气泡同时发出时顺序不保证。

## [0.5.2-ex.4] - 2026-10-23

### 新增

- **按换行自动分条**：出站时把回复按非空行拆成多条 QQ 消息，最多 4 条，多出的合并到最后一条；空行只作分隔，用三个反引号围起来的代码块整块保留。
  `dist/transport/split-bubbles.js`（新增）；`outbound.js` 与 `outbound-buffer.js` 调用。需配合 `streaming: false`。

### 文档

- 重写 `README.md`：按 功能 / 安装 / 配置 / 工作区行为 / 与上游差异 / 维护 / 兼容性 分节。
- `patches/qqbot-ex.patch` 重新生成为相对上游 `0.5.2` 的完整 diff（含分条与 `qqbot_send_text`）；删除已被覆盖的 `send-text-tool.patch`。

## [0.5.2-ex.3] - 2026-10-23

### 新增

- 内置工具 `qqbot_send_text(text)`：把一段文本作为一条独立 QQ 消息**立即**发出，用于把一条回复拆成 2～3 条气泡。每条用户消息最多调用 3 次；与最后的正文合计不超过 4 条（插件被动回复限额）。非 QQ 会话调用返回「无法确定发送目标」。
- `dist/text/send-text-tool.js`：工具实现；`dist/gateway/bootstrap.js` 中注册。

## [0.5.2-ex.2] - 2026-10-23

### 修复

- **客户端插件无法加载**：`lib/client.js` 里 `window.__ModuleLoader__.load({ id })` 仍注册上游包名
  `@tencent-connect/dsh-qqbot`，而宿主按当前包名 `dsh-qqbot-ex` 查找工厂，导致
  `client-modules: could not load "dsh-qqbot-ex": ... loaded without registering "dsh-qqbot-ex"`
  ——设置页「本页面的插件」显示未加载，QQ Bot 设置栏目 / 侧栏绑定入口都不出现。
  现在 `id` 与本包名一致。
- `scripts/verify.mjs` 增加回归检查：执行客户端 bundle，断言其注册 id 等于 `package.json.name` 且导出 `apply()`。
- `scripts/rebase.mjs` 增加「客户端 bundle id = 包名」重写步骤，后续跟进上游不会再漏。

## [0.5.2-ex.1] - 2026-10-23

### 新增

- `workspace` 配置：指定新对话所在的工作区目录（绝对路径，支持 `~`）。
- 启动时自动创建缺失目录，并通过 `ctx.workspaceRegistry.create()` 登记为工作区。
- 新会话创建/恢复后显式 `workspace.attachSession()`，进入工作区账本。
- 配置的 `workspace` 与当前会话 header `cwd` 不一致时，下一条消息自动换新会话（旧会话保留在历史中）。
- 设置页新增「工作区 → 新对话所在工作区」输入框；配置路由支持读写 `workspace`。
- `getProfileDir()` 优先使用 `DSH_PROFILE_DIR`，兼容本地/`link:`/`file:` 安装。

### 变更

- 新会话 `cwd` 的优先级：`workspace` > `cwd` > 进程 cwd。
- 设置页 GET 配置回显生效的 `cwd`（未配置时为进程 cwd）。

### 基于

- `@tencent-connect/dsh-qqbot@0.5.2`（MIT，Copyright (c) 2026 Tencent Connect）。
