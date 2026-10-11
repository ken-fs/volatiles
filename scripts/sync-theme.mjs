#!/usr/bin/env node
// 把站点的主题文件同步到 Ship/game-themes 的最新版（或换一套主题）。零依赖。
//
//   node scripts/sync-theme.mjs                     # 同步当前主题（.template.json / .theme.json 里记的那套）
//   node scripts/sync-theme.mjs --theme aqua        # 换成另一套
//   node scripts/sync-theme.mjs --themes-dir <dir>  # 主题库不在 ../game-themes 时
//   node scripts/sync-theme.mjs --no-install        # 不跑 pnpm install / gen-assets
//
// 规则：主题本身的改动先在 Ship/game-themes 改并提交，各站再跑这个脚本同步——
// 不要在站里直接改 src/styles/theme/*.css（下次同步会被覆盖，每日巡检也会点名「主题没同步」）。
// 站点特有的样式写进 src/styles/globals.css 的桥接层或组件里。
//
// 做的事：复制 base.css + tokens/<id>.css → src/styles/theme/；换字体包（package.json + pnpm install）；
// 重跑 gen-assets（favicon / OG 图跟随新的强调色）；更新 .theme.json 与 .template.json 的 theme / themesCommit。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_DIR, installTheme, listThemes, pnpmInstall, pnpmRun, themeIdFromCss, themesCommit } from './lib/theme-files.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (k) => {
  const i = argv.indexOf(`--${k}`);
  if (i >= 0) return argv[i + 1];
  return argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
};
if (argv.includes('-h') || argv.includes('--help')) {
  console.log('用法: node scripts/sync-theme.mjs [--theme <id>] [--themes-dir <dir>] [--no-install]');
  process.exit(0);
}

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const stampPath = join(ROOT, '.template.json');
const themeJsonPath = join(ROOT, '.theme.json');
const stamp = readJson(stampPath);
const themeJson = readJson(themeJsonPath);
const themeCssPath = join(ROOT, THEME_DIR, 'theme.css');
const current =
  stamp?.theme ?? themeJson?.id ?? (existsSync(themeCssPath) ? themeIdFromCss(readFileSync(themeCssPath, 'utf8')) : null);

// 主题库位置：--themes-dir > .template.json 的 themesDir（相对 Ship）> ../game-themes
const themesDir = resolve(
  flag('themes-dir') ?? (stamp?.themesDir ? join(ROOT, '..', stamp.themesDir) : join(ROOT, '..', 'game-themes')),
);
if (!existsSync(join(themesDir, 'tokens'))) {
  console.error(`✗ 找不到主题库 ${themesDir}（要有 tokens/），用 --themes-dir 指定`);
  process.exit(1);
}
const next = flag('theme') ?? current;
if (!next) {
  console.error('✗ 不知道当前用的哪套主题（没有 .template.json / .theme.json），用 --theme <id> 指定');
  process.exit(1);
}
const available = listThemes(themesDir);
if (!available.includes(next)) {
  console.error(`✗ 没有主题「${next}」，可选：${available.join(' / ')}`);
  process.exit(1);
}

const before = {
  base: existsSync(join(ROOT, THEME_DIR, 'base.css')) ? readFileSync(join(ROOT, THEME_DIR, 'base.css'), 'utf8') : '',
  theme: existsSync(themeCssPath) ? readFileSync(themeCssPath, 'utf8') : '',
};
const fonts = installTheme(ROOT, themesDir, next);
const changed =
  before.base !== readFileSync(join(ROOT, THEME_DIR, 'base.css'), 'utf8') || before.theme !== readFileSync(themeCssPath, 'utf8');
const commit = themesCommit(themesDir);

console.log(
  `✓ 主题 ${current && current !== next ? `${current} → ${next}` : next}：${changed ? '文件已更新' : '文件本来就是最新'}（game-themes@${commit?.slice(0, 7) ?? '?'}）`,
);
if (fonts.added.length || fonts.removed.length) {
  console.log(`  字体包 +${fonts.added.join(' +') || '—'}  -${fonts.removed.join(' -') || '—'}`);
}

if (!argv.includes('--no-install')) {
  if (fonts.added.length || fonts.removed.length) {
    if (!pnpmInstall(ROOT)) console.warn('  ⚠ pnpm install 失败：提交前先 pnpm install（lockfile 要跟 package.json 一致，否则 CI 装不上）');
  }
  if (current !== next && !pnpmRun(ROOT, 'gen-assets')) console.warn('  ⚠ pnpm gen-assets 失败：favicon / OG 图还是旧强调色，之后手动重跑');
}

const pickedBy = current !== next ? '--theme' : (themeJson?.pickedBy ?? stamp?.themePickedBy ?? null);
writeFileSync(
  themeJsonPath,
  JSON.stringify({ ...(themeJson ?? {}), id: next, pickedBy, themesCommit: commit }, null, 2) + '\n',
);
if (stamp) {
  writeFileSync(stampPath, JSON.stringify({ ...stamp, theme: next, themePickedBy: pickedBy, themesCommit: commit }, null, 2) + '\n');
  console.log(`✓ .template.json：theme=${next} themesCommit=${commit?.slice(0, 7)}`);
}
console.log(`\n下一步：pnpm build 看一眼 → git add -A && git commit -m "style: sync theme ${next} (game-themes@${commit?.slice(0, 7)})" && git push`);
