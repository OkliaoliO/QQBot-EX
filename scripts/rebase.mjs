#!/usr/bin/env node
/**
 * 把 QQBot-EX 的改动重放到一个上游 @tencent-connect/dsh-qqbot 包目录。
 *
 * 用法：
 *   node scripts/rebase.mjs <上游包目录>
 *   省略参数时默认使用当前 profile 里安装的 @tencent-connect/dsh-qqbot。
 *
 * 只修改代码（dist/config.js、dist/config.d.ts、dist/session/session-manager.js、
 * dist/gateway/bootstrap.js、dist/setup/bind-routes.js、dist/shared/utils.js、
 * lib/client.js），不碰 README。锚点按上游 0.5.2 编写；结构变化较大时脚本会
 * 拒绝写入并报错。完成后把 dist/、lib/ 覆盖到本仓库，再运行
 * `node scripts/verify.mjs`。
 *
 * 修改安装包文件后，需要触发一次 profile 重载才会加载新代码。
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const lines = (...items) => items.join('\n');

const profileDir = process.env.DSH_PROFILE_DIR
  ?? join(homedir(), '.dsh', 'profiles', process.env.DSH_PROFILE ?? 'desktop');
const pkgDir = resolve(
  process.argv[2] ?? join(profileDir, 'node_modules', '@tencent-connect', 'dsh-qqbot'),
);

if (!existsSync(join(pkgDir, 'package.json'))) {
  console.error(`找不到 QQ Bot 插件包：${pkgDir}`);
  process.exit(1);
}

/** @type {Array<{ file: string, label: string, from: string, to: string, all?: boolean }>} */
const edits = [
  // ── 1. 配置 Schema ──
  {
    file: 'dist/config.js',
    label: 'ConfigSchema.workspace',
    from: "    cwd: Schema.string().description('Agent working directory'),",
    to: lines(
      "    cwd: Schema.string().description('Agent working directory'),",
      "    workspace: Schema.string().description('新对话所在工作区目录（绝对路径，留空回落到 cwd）'),",
    ),
  },
  {
    file: 'dist/config.d.ts',
    label: 'ImQQBotConfig.workspace',
    from: lines(
      '    /** Agent 工作目录（缺省回落到进程 cwd） */',
      '    cwd?: string;',
    ),
    to: lines(
      '    /** Agent 工作目录（缺省回落到进程 cwd） */',
      '    cwd?: string;',
      '    /** 新对话所在工作区目录（绝对路径，留空回落到 cwd） */',
      '    workspace?: string;',
    ),
  },

  // ── 2. SessionManager：新会话 cwd 优先取 workspace，并登记到工作区 ──
  {
    file: 'dist/session/session-manager.js',
    label: 'SessionManager.workspace field',
    from: lines(
      '    /** 由 bootstrap 注入的审批通道（approval/request → QQ），会话回收时清理其待批审批 */',
      '    approvalChannel;',
    ),
    to: lines(
      '    /** 由 bootstrap 注入的审批通道（approval/request → QQ），会话回收时清理其待批审批 */',
      '    approvalChannel;',
      '    /** 由 bootstrap 注入的「新对话工作区」实体（可选；用于把新会话登记到工作区） */',
      '    workspace;',
    ),
  },
  {
    file: 'dist/session/session-manager.js',
    label: 'SessionManager.effectiveCwd + attachToWorkspace',
    from: lines(
      '        this.registerScopePromptInjection();',
      '    }',
    ),
    to: lines(
      '        this.registerScopePromptInjection();',
      '    }',
      '    /**',
      '     * 新会话的工作目录：workspace > cwd > 进程 cwd。',
      '     * workspace 同时决定新会话在宿主工作区列表中的归属（宿主按 session header 的 cwd 归组）。',
      '     */',
      '    effectiveCwd() {',
      '        return this.config.workspace || this.config.cwd || process.cwd();',
      '    }',
      '    /**',
      '     * 把会话登记到配置的工作区。',
      '     *',
      '     * 宿主按 session header 的 cwd 归组，但绕过 sessionController 直接创建的',
      '     * 会话不会自动出现在工作区里——必须显式 attach 才会进入 workspace 的',
      '     * sessionIds 账本。header cwd 不匹配（旧会话仍在原工作区）时静默跳过。',
      '     */',
      '    async attachToWorkspace(sessionId, agent) {',
      '        const workspace = this.workspace;',
      "        if (!workspace || typeof workspace.attachSession !== 'function')",
      '            return;',
      '        const cwd = agent?.session?.header?.cwd;',
      '        if (cwd !== void 0 && cwd !== workspace.path)',
      '            return;',
      '        try {',
      '            await workspace.attachSession(sessionId);',
      '        }',
      '        catch (err) {',
      '            this.logger.warn(`workspace attach failed: session=${sessionId} err=${err instanceof Error ? err.message : String(err)}`);',
      '        }',
      '    }',
      '    /** 目标工作区与当前会话 header cwd 是否不一致（工作区变更后需要换新会话）。 */',
      '    isWorkspacePlacementStale(record) {',
      '        const workspace = this.workspace;',
      '        if (!workspace)',
      '            return false;',
      '        const cwd = record.agent?.session?.header?.cwd;',
      '        return cwd !== void 0 && cwd !== workspace.path;',
      '    }',
    ),
  },
  {
    file: 'dist/session/session-manager.js',
    label: 'getOrCreate allowReset parameter',
    from: '    async getOrCreate(scope, peerId, senderId, replyTarget) {',
    to: '    async getOrCreate(scope, peerId, senderId, replyTarget, allowReset = true) {',
  },
  {
    file: 'dist/session/session-manager.js',
    label: 'create/resume cwd uses effectiveCwd()',
    from: '        cwd: this.config.cwd || process.cwd(),',
    to: '        cwd: this.effectiveCwd(),',
    all: true,
  },
  {
    file: 'dist/session/session-manager.js',
    label: 'attach existing live session (retry)',
    from: lines(
      '        if (existing) {',
      '            existing.replyTarget = replyTarget;',
      '            existing.lastActivity = Date.now();',
      '            return existing;',
      '        }',
    ),
    to: lines(
      '        if (existing) {',
      '            // 工作区变更后 header cwd 不会变：自动换新会话，避免继续继承旧 session',
      '            if (allowReset && this.isWorkspacePlacementStale(existing)) {',
      '                this.logger.info(`workspace changed, starting a new session: key=${key} session=${existing.sessionId}`);',
      '                await this.remove(scope, peerId);',
      '                return this.getOrCreate(scope, peerId, senderId, replyTarget, false);',
      '            }',
      '            existing.replyTarget = replyTarget;',
      '            existing.lastActivity = Date.now();',
      '            // 幂等重试：首次 attach 若因持久化时序失败，后续消息会再试一次',
      '            await this.attachToWorkspace(existing.sessionId, existing.agent);',
      '            return existing;',
      '        }',
    ),
  },
  {
    file: 'dist/session/session-manager.js',
    label: 'attach newly created session',
    from: lines(
      '        const record = {',
      '            sessionKey: key,',
    ),
    to: lines(
      '        await this.attachToWorkspace(sessionId, agent);',
      '        const record = {',
      '            sessionKey: key,',
    ),
  },
  {
    file: 'dist/session/session-manager.js',
    label: 'reset stale resumed session',
    from: lines(
      '        this.sessions.set(key, record);',
      '        return record;',
    ),
    to: lines(
      '        this.sessions.set(key, record);',
      '        // 恢复到的旧会话若 cwd 与目标工作区不一致，自动换新会话（旧历史保留在旧 session）',
      '        if (allowReset && this.isWorkspacePlacementStale(record)) {',
      '            this.logger.info(`workspace changed, starting a new session: key=${key} session=${record.sessionId}`);',
      '            await this.remove(scope, peerId);',
      '            return this.getOrCreate(scope, peerId, senderId, replyTarget, false);',
      '        }',
      '        return record;',
    ),
  },
  {
    file: 'dist/session/session-manager.js',
    label: 'attach forked session',
    from: '        this.modelResolver.setSessionId(key, childId);',
    to: lines(
      '        await this.attachToWorkspace(childId, created.agent);',
      '        this.modelResolver.setSessionId(key, childId);',
    ),
  },

  {
    file: 'dist/shared/utils.js',
    label: 'getProfileDir honors DSH_PROFILE_DIR (linked installs)',
    from: 'export function getProfileDir(baseDir = PLUGIN_ROOT) {',
    to: lines(
      'export function getProfileDir(baseDir = PLUGIN_ROOT) {',
      '    // EX: profile 启动器会设置 DSH_PROFILE_DIR；优先使用它，保证本地/链接安装也能定位 profile。',
      '    const envProfileDir = process.env.DSH_PROFILE_DIR;',
      "    if (envProfileDir !== undefined && envProfileDir !== '' && existsSync(envProfileDir))",
      '        return envProfileDir;',
    ),
  },

  // ── 3. Gateway bootstrap：解析目录并登记工作区 ──
  {
    file: 'dist/gateway/bootstrap.js',
    label: 'node:fs/os/path imports',
    from: 'import { registerSendFileTool } from "../media/send-file-tool.js";',
    to: lines(
      'import { registerSendFileTool } from "../media/send-file-tool.js";',
      "import { mkdir } from 'node:fs/promises';",
      "import { homedir } from 'node:os';",
      "import { isAbsolute, resolve } from 'node:path';",
    ),
  },
  {
    file: 'dist/gateway/bootstrap.js',
    label: 'resolveWorkspace helper',
    from: 'export async function bootstrapGateway(ctx, agents, config, logger) {',
    to: lines(
      '/**',
      ' * 解析并登记「新对话工作区」。',
      ' *',
      ' * - 支持 ~ 展开；相对路径按宿主进程 cwd 解析；',
      ' * - 目录不存在时递归创建；',
      ' * - 通过 ctx.workspaceRegistry 登记（已存在则复用），返回工作区实体供新会话 attach；',
      ' * - 登记失败不阻断启动，仅告警（会话仍使用该目录，只是不进入工作区列表）。',
      ' *',
      ' * @returns {{ path: string, workspace?: unknown }} 规范化路径 + 工作区实体；',
      ' *          未配置或目录不可用时返回 undefined（回落 cwd）。',
      ' */',
      'async function resolveWorkspace(ctx, workspace, logger) {',
      "    const raw = typeof workspace === 'string' ? workspace.trim() : '';",
      '    if (!raw)',
      '        return undefined;',
      '    let path = raw;',
      "    if (path === '~')",
      '        path = homedir();',
      "    else if (path.startsWith('~/'))",
      '        path = resolve(homedir(), path.slice(2));',
      '    if (!isAbsolute(path))',
      '        path = resolve(process.cwd(), path);',
      '    try {',
      '        await mkdir(path, { recursive: true });',
      '    }',
      '    catch (err) {',
      '        logger.error(`workspace unavailable: ${path} (${err instanceof Error ? err.message : String(err)}) — falling back to cwd`);',
      '        return undefined;',
      '    }',
      '    try {',
      "        const registry = ctx.get('workspaceRegistry');",
      "        if (registry && typeof registry.create === 'function') {",
      '            const registered = await registry.create(path);',
      "            logger.info(`workspace ready: ${registered.path}${registered.title ? ` (${registered.title})` : ''}`);",
      '            // 用 realpath 规范化后的 workspace.path 作为 session cwd，',
      '            // 保证 attachSession 的 canonical cwd 校验通过（符号链接场景）。',
      '            return { path: registered.path, workspace: registered };',
      '        }',
      "        logger.warn('workspaceRegistry unavailable — QQ conversations will not be grouped under a workspace');",
      '    }',
      '    catch (err) {',
      '        logger.warn(`workspace registration failed: ${path} (${err instanceof Error ? err.message : String(err)}) — sessions still use this directory`);',
      '    }',
      '    return { path, workspace: void 0 };',
      '}',
      '',
      'export async function bootstrapGateway(ctx, agents, config, logger) {',
    ),
  },
  {
    file: 'dist/gateway/bootstrap.js',
    label: 'bootstrapGateway workspace resolution',
    from: lines(
      'export async function bootstrapGateway(ctx, agents, config, logger) {',
      '    const manager = new SessionManager(ctx, agents, config, logger);',
    ),
    to: lines(
      'export async function bootstrapGateway(ctx, agents, config, logger) {',
      '    // 解析「新对话工作区」：确保目录存在并登记为宿主工作区；失败/未配置时回落到 cwd。',
      '    const resolvedWorkspace = await resolveWorkspace(ctx, config.workspace, logger);',
      '    config = { ...config, workspace: resolvedWorkspace?.path };',
      '    const manager = new SessionManager(ctx, agents, config, logger);',
      '    // 新会话创建后需要显式 attach 才会出现在工作区列表中（见 SessionManager）',
      '    manager.workspace = resolvedWorkspace?.workspace;',
    ),
  },

  // ── 4. 设置页配置路由：workspace 可读写 ──
  {
    file: 'dist/setup/bind-routes.js',
    label: 'node:path import',
    from: 'import { getProfileDir } from "../shared/index.js";',
    to: lines(
      "import { isAbsolute } from 'node:path';",
      'import { getProfileDir } from "../shared/index.js";',
    ),
  },
  {
    file: 'dist/setup/bind-routes.js',
    label: 'editable key workspace',
    from: "    'provider', 'model', 'preset',",
    to: "    'provider', 'model', 'preset', 'workspace',",
  },
  {
    file: 'dist/setup/bind-routes.js',
    label: 'workspace validator',
    from: "    preset: stringSchema('preset'),",
    to: lines(
      "    preset: stringSchema('preset'),",
      '    workspace: (v) => {',
      "        const value = stringSchema('workspace')(v).trim();",
      "        if (value === '')",
      "            return '';",
      "        if (!isAbsolute(value) && value !== '~' && !value.startsWith('~/')) {",
      "            throw new TypeError('workspace 必须是绝对路径（或以 ~ 开头）');",
      '        }',
      '        return value;',
      '    },',
    ),
  },
  {
    file: 'dist/setup/bind-routes.js',
    label: 'GET config echoes effective cwd + workspace',
    from: lines(
      '        const { appSecret: _s, ...safe } = current;',
      '        sendJson(res, 200, { config: safe });',
    ),
    to: lines(
      '        const { appSecret: _s, ...safe } = current;',
      '        // cwd 回显生效的默认工作目录；workspace 始终回显（未配置为空串）',
      '        sendJson(res, 200, { config: { ...safe, cwd: current.cwd || process.cwd(), workspace: current.workspace ?? \'\' } });',
    ),
  },

  // ── 5. 设置页 UI：工作区输入框 ──
  {
    file: 'lib/client.js',
    label: 'ConfigPanel workspace field',
    from: '}), form.cwd !== void 0 ?',
    to: lines(
      '}), (0, react.createElement)("div", { className: "imqb2-group-title" }, "工作区"), (0, react.createElement)(FieldRow, {',
      '    label: "新对话所在工作区",',
      '    help: "新会话在该目录中创建，并显示在宿主对应的项目/工作区下；留空则使用 Agent 工作目录。目录不存在时自动创建并登记为工作区。",',
      '    value: form.workspace ?? "",',
      '    placeholder: "留空使用 " + (form.cwd || "Agent 工作目录"),',
      '    onChange: (v) => {',
      '        patch("workspace", v);',
      '    }',
      '}), form.cwd !== void 0 ?',
    ),
  },

];

let applied = 0;
let skipped = 0;
let failed = 0;

for (const edit of edits) {
  const path = join(pkgDir, edit.file);
  if (!existsSync(path)) {
    console.error(`ERROR  ${edit.file}: file not found (${edit.label})`);
    failed += 1;
    continue;
  }
  const before = readFileSync(path, 'utf8');
  if (before.includes(edit.to)) {
    console.log(`skip   ${edit.file}: ${edit.label} (already applied)`);
    skipped += 1;
    continue;
  }
  const occurrences = before.split(edit.from).length - 1;
  if (occurrences === 0) {
    console.error(`ERROR  ${edit.file}: anchor not found (${edit.label})`);
    failed += 1;
    continue;
  }
  if (!edit.all && occurrences !== 1) {
    console.error(`ERROR  ${edit.file}: anchor matched ${occurrences} times (${edit.label})`);
    failed += 1;
    continue;
  }
  const after = edit.all ? before.split(edit.from).join(edit.to) : before.replace(edit.from, edit.to);
  // 先写临时文件再 rename，避免就地改写 pnpm 硬链接/读到半个文件
  const tmp = `${path}.qqbot-workspace.tmp`;
  writeFileSync(tmp, after, 'utf8');
  renameSync(tmp, path);
  applied += 1;
  console.log(`patch  ${edit.file}: ${edit.label}`);
}

console.log(`\n目标插件目录: ${pkgDir}`);
console.log(`结果: ${applied} 处已修改, ${skipped} 处已存在, ${failed} 处失败`);
if (failed > 0) process.exit(1);
