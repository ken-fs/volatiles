// Shared by scripts/new-site.mjs and scripts/sync-theme.mjs (zero dependencies).
//
// Contract with Ship/game-themes (same for every Ship game template):
//   <site>/src/styles/theme/base.css   = game-themes/base.css            (byte copy)
//   <site>/src/styles/theme/theme.css  = game-themes/tokens/<id>.css     (byte copy)
//   fonts: every @fontsource package a token file imports goes into package.json
//          dependencies (self-hosted, no Google Fonts).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const THEME_DIR = 'src/styles/theme';
/** Every @fontsource package is on 5.x (checked 2026-10-11); pnpm resolves the newest 5.x. */
export const FONT_RANGE = '^5.3.0';

export function listThemes(themesDir) {
  const dir = join(themesDir, 'tokens');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => f.slice(0, -4))
    .sort();
}

/** Packages a token file needs: its `@import "@fontsource…"` lines + the "需要：npm i …" header. */
export function fontPackages(css) {
  const pkgs = new Set();
  for (const m of css.matchAll(/@import\s+["'](@fontsource[^/"']*\/[^/"']+)/g)) pkgs.add(m[1]);
  for (const m of css.matchAll(/npm i ([^\n*]+)/g)) {
    for (const p of m[1].trim().split(/\s+/)) if (p.startsWith('@fontsource')) pkgs.add(p);
  }
  return [...pkgs].sort();
}

/** Header `game-themes / candy —— …` → 'candy'. */
export function themeIdFromCss(css) {
  return css.match(/game-themes\s*\/\s*([a-z0-9-]+)/i)?.[1] ?? null;
}

export function themesCommit(themesDir) {
  try {
    return execFileSync('git', ['-C', themesDir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * Copy base.css + tokens/<id>.css into <siteRoot>/src/styles/theme/ and swap the
 * font dependencies in package.json. Returns { added, removed } package lists.
 */
export function installTheme(siteRoot, themesDir, id) {
  const tokenFile = join(themesDir, 'tokens', `${id}.css`);
  if (!existsSync(tokenFile)) throw new Error(`主题 ${id} 不存在：${tokenFile}`);
  const out = join(siteRoot, THEME_DIR);
  mkdirSync(out, { recursive: true });
  const oldThemePath = join(out, 'theme.css');
  const oldFonts = existsSync(oldThemePath) ? fontPackages(readFileSync(oldThemePath, 'utf8')) : [];
  copyFileSync(join(themesDir, 'base.css'), join(out, 'base.css'));
  copyFileSync(tokenFile, oldThemePath);
  const newFonts = fontPackages(readFileSync(tokenFile, 'utf8'));

  const pkgPath = join(siteRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies ??= {};
  const removed = oldFonts.filter((p) => !newFonts.includes(p) && pkg.dependencies[p]);
  for (const p of removed) delete pkg.dependencies[p];
  const added = newFonts.filter((p) => !pkg.dependencies[p]);
  for (const p of added) pkg.dependencies[p] = FONT_RANGE;
  pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  return { added, removed, fonts: newFonts };
}

/** `pnpm install` (updates pnpm-lock.yaml when package.json changed). Proxy env is passed through. */
export function pnpmInstall(siteRoot) {
  const r = spawnSync('pnpm', ['install', '--config.confirmModulesPurge=false'], { cwd: siteRoot, stdio: 'inherit', env: process.env });
  return r.status === 0;
}

export function pnpmRun(siteRoot, script) {
  const r = spawnSync('pnpm', ['run', script], { cwd: siteRoot, stdio: 'inherit', env: process.env });
  return r.status === 0;
}
