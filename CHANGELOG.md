# Changelog

本文件记录 QQBot-EX 相对上游 `@tencent-connect/dsh-qqbot` 的变化。

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
