# Changelog

本文件记录 QQBot-EX 相对上游 `@tencent-connect/dsh-qqbot` 的变化。

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
