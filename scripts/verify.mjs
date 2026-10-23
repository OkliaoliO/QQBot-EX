#!/usr/bin/env node
/**
 * QQBot-EX lightweight verifier.
 *
 * Checks package/bundle/client metadata, EX code markers, and JavaScript syntax.
 * No external dependencies; run with any Node >= 20.3.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const notes = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
expect(pkg.name === 'dsh-qqbot-ex', 'package.json name must be dsh-qqbot-ex');
expect(/^0\.5\.2-ex\./.test(pkg.version), 'version should stay in the 0.5.2-ex.* line');
expect(pkg.type === 'module', 'package.json must be ESM');
expect(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'missing dsh.bundle.patch');
expect(pkg.dsh?.client?.platform === 'web', 'missing dsh.client.platform=web');
expect(pkg.main === './dist/index.js', 'main must point at dist/index.js');
expect(pkg.exports?.['.']?.import === './dist/index.js', 'exports["."].import is wrong');
expect(pkg.exports?.['./client']?.default === './lib/client.js', 'exports["./client"] is wrong');

for (const relative of [
  'dist/index.js',
  'dist/index.d.ts',
  'lib/client.js',
  'cordis.patch.yml',
  'LICENSE',
  'NOTICE',
]) {
  expect(existsSync(join(root, relative)), `missing file: ${relative}`);
}

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
expect(/id:\s*im-qqbot\b/.test(patch), 'cordis.patch.yml must insert row id im-qqbot');
expect(/name:\s*'dsh-qqbot-ex'/.test(patch), "cordis.patch.yml must set name: 'dsh-qqbot-ex'");
expect(/workspace:\s*''/.test(patch), 'cordis.patch.yml should default workspace to empty string');

// 客户端 bundle 必须以本包名注册：宿主按 row id（= 包名）查找 __ModuleLoader__ 工厂，
// 注册成上游包名会被判为「loaded without registering」，整个客户端插件拒绝加载。
// 这里直接执行 bundle，复刻宿主 client-modules 的 id 校验。
const clientBundle = readFileSync(join(root, 'lib/client.js'), 'utf8');
const clientRegistry = new Map();
runInContext(clientBundle, createContext({
  window: { __ModuleLoader__: { load: (entry) => clientRegistry.set(entry.id, entry) } },
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  fetch: () => Promise.reject(new Error('verify: network disabled')),
}), { filename: 'lib/client.js' });
expect(
  clientRegistry.has(pkg.name),
  `lib/client.js must register id "${pkg.name}" via __ModuleLoader__.load (registered: ${JSON.stringify([...clientRegistry.keys()])})`,
);
if (clientRegistry.has(pkg.name)) {
  const clientModule = clientRegistry.get(pkg.name).factory(() => ({}));
  expect(typeof clientModule?.apply === 'function', 'lib/client.js must export apply()');
}

const markers = [
  ['dist/config.js', 'workspace: Schema.string', 'ConfigSchema.workspace'],
  ['dist/config.d.ts', 'workspace?: string', 'ImQQBotConfig.workspace type'],
  ['dist/session/session-manager.js', 'effectiveCwd()', 'SessionManager.effectiveCwd'],
  ['dist/session/session-manager.js', 'attachToWorkspace', 'SessionManager.attachToWorkspace'],
  ['dist/session/session-manager.js', 'isWorkspacePlacementStale', 'workspace auto-reset'],
  ['dist/gateway/bootstrap.js', 'workspaceRegistry', 'workspace registration'],
  ['dist/gateway/bootstrap.js', 'resolveWorkspace', 'workspace resolution'],
  ['dist/setup/bind-routes.js', "'workspace'", 'workspace in config route'],
  ['dist/shared/utils.js', 'DSH_PROFILE_DIR', 'linked-install profile fallback'],
  ['lib/client.js', '新对话所在工作区', 'settings UI field'],
];
for (const [file, needle, label] of markers) {
  const content = readFileSync(join(root, file), 'utf8');
  expect(content.includes(needle), `${label}: marker not found in ${file}`);
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.name.endsWith('.js')) yield path;
  }
}

let checked = 0;
for (const file of [...walk(join(root, 'dist')), ...walk(join(root, 'lib'))]) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  checked += 1;
  if (result.status !== 0) {
    errors.push(`syntax error: ${file}\n${result.stderr.trim()}`);
  }
}

notes.push(`checked ${checked} JavaScript files`);
notes.push(`package ${pkg.name}@${pkg.version}`);

for (const note of notes) console.log(`· ${note}`);
if (errors.length > 0) {
  console.error('\nQQBot-EX verification failed:');
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}
console.log('\nQQBot-EX verification passed.');
