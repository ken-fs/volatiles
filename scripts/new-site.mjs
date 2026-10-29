#!/usr/bin/env node
// 从本模板（game-template-anvil：AnvilWiki · Astro → Cloudflare Workers）生成一个新游戏站。零依赖。
//
// ⚠️ 不要直接跑这个脚本：走 Ship 统一入口（它会先把模板和主题库拉到最新、写 .template.json）
//   node ~/Desktop/david/Ship/scripts/new-site.mjs game-anvil <slug> <domain> -- --name "Game Name" --roblox <placeId> --keywords "..."
//
//   node scripts/new-site.mjs <slug> <domain> [--name "Game Name"] [--roblox <placeId> | --steam <appid>]
//        [--keywords "<target keywords>"] [--theme <id>] [--exclude a,b] [--themes-dir <abs path>]
//        [--dir ../<slug>] [--no-install]
//
// 做的事：
//   ① 选主题：--theme 优先；否则跑 <themes-dir>/pick.mjs "<name> <keywords>" --json（兄弟站用 --exclude 避开）
//   ② 复制模板（git 跟踪 + 未忽略的文件；不带 .git / node_modules / dist / .env / reports / 模板自用文档）
//   ③ 装主题：base.css + tokens/<id>.css → src/styles/theme/，字体包写进 package.json
//   ④ 改写占位：Example Game → 游戏名、example.com → 域名、example-game → slug（Worker 名）、
//      官方游戏链接（巡检靠它认游戏）、wrangler.jsonc 的 routes（主域 + www）
//   ⑤ pnpm install（更新 lockfile）+ gen-assets（favicon / 默认 OG 图）+ gen-covers（文章封面）—— 失败只警告
//   ⑥ 写 .theme.json，git init + 首次提交，打印清单（最后一步 = site-onboard 上线验收）

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installTheme, listThemes, pnpmInstall, pnpmRun, themesCommit } from './lib/theme-files.mjs';

const TEMPLATE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = { name: 'Example Game', domain: 'example.com', slug: 'example-game' };
// 模板自用、不进新站的文件
const TEMPLATE_ONLY = new Set(['TEMPLATE.md', 'CHANGELOG.md', '.theme.json', '.template.json']);

// ─── 参数 ────────────────────────────────────────────────────────────────────
const VALUE_FLAGS = ['name', 'dir', 'theme', 'exclude', 'themes-dir', 'roblox', 'steam', 'keywords'];
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.match(/^--([a-z-]+)=(.*)$/s);
    if (eq && VALUE_FLAGS.includes(eq[1])) flags[eq[1]] = eq[2];
    else if (arg.startsWith('--') && VALUE_FLAGS.includes(arg.slice(2))) {
      flags[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else if (arg === '--no-install') flags.noInstall = true;
    else if (arg === '-h' || arg === '--help') flags.help = true;
    else if (arg.startsWith('--')) usage(`未知参数 ${arg}`);
    else positional.push(arg);
  }
  return { flags, positional };
}

function usage(message) {
  if (message) console.error(`✗ ${message}\n`);
  console.error(
    '用法: node scripts/new-site.mjs <slug> <domain> [--name "Game Name"] [--roblox <placeId> | --steam <appid>] [--keywords "..."] [--theme <id>] [--exclude a,b] [--themes-dir <dir>] [--dir ../<slug>] [--no-install]\n' +
      '通常经 Ship 入口调用：node ~/Desktop/david/Ship/scripts/new-site.mjs game-anvil <slug> <domain> -- --name "..." --roblox <placeId>',
  );
  process.exit(message ? 1 : 0);
}

const { flags, positional } = parseArgs(process.argv.slice(2));
if (flags.help) usage();
const [slug, rawDomain] = positional;
if (!(slug && rawDomain)) usage('缺少 <slug> 或 <domain>');
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) usage('slug 只能包含小写字母、数字和连字符（用作 Worker 名）');
const domain = rawDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) usage(`域名看起来不对：${rawDomain}`);
if (flags.roblox && flags.steam) usage('--roblox 和 --steam 只能选一个');
if (flags.roblox && !/^\d+$/.test(flags.roblox)) usage('--roblox 要的是 placeId（roblox.com/games/<这串数字>）');
if (flags.steam && !/^\d+$/.test(flags.steam)) usage('--steam 要的是 appid（store.steampowered.com/app/<这串数字>）');
const name = (flags.name ?? slug.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')).trim();
if (/["\\\n]/.test(name)) usage('--name 里不要有双引号 / 反斜杠 / 换行');
// 名字里的撇号（Garry's Mod）：site.ts 是单引号字符串 → \'；MDX frontmatter 是 YAML 单引号 → ''
const tsName = name.replace(/'/g, "\\'");
const yamlName = name.replace(/'/g, "''");
const target = resolve(flags.dir ?? join(TEMPLATE_ROOT, '..', slug));
const themesDir = resolve(flags['themes-dir'] ?? join(TEMPLATE_ROOT, '..', 'game-themes'));
if (!existsSync(join(themesDir, 'pick.mjs'))) usage(`找不到主题库 ${themesDir}（要有 pick.mjs + tokens/），用 --themes-dir 指定`);
if (existsSync(target) && readdirSync(target).length > 0) usage(`目标目录已存在且非空：${target}`);

const warnings = [];
const warn = (msg) => {
  warnings.push(msg);
  console.warn(`  ⚠ ${msg}`);
};

// ─── ① 选主题 ────────────────────────────────────────────────────────────────
const available = listThemes(themesDir);
let theme;
if (flags.theme) {
  if (!available.includes(flags.theme)) usage(`没有主题「${flags.theme}」，可选：${available.join(' / ')}`);
  theme = { id: flags.theme, pickedBy: '--theme', hits: [] };
  console.log(`✓ 主题：${theme.id}（--theme 指定）`);
} else {
  const platformWord = flags.roblox ? 'roblox' : flags.steam ? 'steam' : '';
  const text = [name, flags.keywords ?? '', platformWord].join(' ').trim();
  const pickArgs = [join(themesDir, 'pick.mjs'), text, '--json'];
  if (flags.exclude) pickArgs.push(`--exclude=${flags.exclude}`);
  const out = execFileSync(process.execPath, pickArgs, { encoding: 'utf8' });
  const picked = JSON.parse(out.trim().split('\n').pop());
  theme = { id: picked.id, pickedBy: 'pick.mjs', hits: picked.hits ?? [] };
  console.log(`✓ 主题：${picked.id}（pick.mjs："${text}" → 命中 ${picked.hits?.join(', ') || '无'}${picked.alternatives?.length ? `；备选 ${picked.alternatives.join(' / ')}` : ''}）`);
  if (picked.fallback) {
    warn(`pick.mjs 没命中任何题材词，用了默认 ${picked.id}。看 game-themes/THEMES.md「怎么选」后用 --theme <id> 确认（node scripts/sync-theme.mjs --theme <id> 可事后换）`);
  } else if (picked.tie) {
    warn(`pick.mjs 前两名同分（${picked.id} vs ${picked.alternatives?.[0]}）。看竞品配色反着走，用 --theme <id> 确认（事后可 node scripts/sync-theme.mjs --theme <id>）`);
  }
}

// ─── ② 复制 ──────────────────────────────────────────────────────────────────
const NEVER = [
  /(^|\/)\.git(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.(astro|wrangler|turbo|cache)(\/|$)/,
  /(^|\/)(dist|coverage|reports|ops)(\/|$)/,
  /(^|\/)\.env(\.(?!example$)[^/]*)?$/,
  /(^|\/)\.dev\.vars/,
  /\.pem$/,
  /(^|\/)\.DS_Store$/,
];
const allowed = (p) => !NEVER.some((re) => re.test(p)) && !TEMPLATE_ONLY.has(p);

function listFiles() {
  const g = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: TEMPLATE_ROOT, encoding: 'utf8' });
  if (g.status === 0 && g.stdout) return g.stdout.split('\0').filter(Boolean);
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(TEMPLATE_ROOT, dir))) {
      const rel = dir ? `${dir}/${entry}` : entry;
      if (!allowed(rel)) continue;
      if (statSync(join(TEMPLATE_ROOT, rel)).isDirectory()) walk(rel);
      else out.push(rel);
    }
  };
  walk('');
  return out;
}

const files = listFiles().filter((f) => allowed(f) && existsSync(join(TEMPLATE_ROOT, f)));
for (const file of files) {
  const dest = join(target, file);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(TEMPLATE_ROOT, file), dest);
}
console.log(`✓ 复制 ${files.length} 个文件 → ${target}`);

// ─── ③ 主题文件 + 字体包 ─────────────────────────────────────────────────────
const fonts = installTheme(target, themesDir, theme.id);
console.log(`✓ 主题文件 → src/styles/theme/{base,theme}.css；字体 ${fonts.fonts.join(' ')}`);

// ─── ④ 改写占位 ─────────────────────────────────────────────────────────────
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function rewrite(rel, edits, { required = true } = {}) {
  const path = join(target, rel);
  if (!existsSync(path)) {
    if (required) warn(`${rel} 不存在，跳过改写`);
    return;
  }
  let text = readFileSync(path, 'utf8');
  for (const [pattern, replacement] of edits) {
    const next = text.replace(pattern, replacement);
    if (next === text && required && !(pattern instanceof RegExp && pattern.global)) warn(`${rel}: 未匹配 ${pattern}`);
    text = next;
  }
  writeFileSync(path, text);
}
const all = (s) => new RegExp(escRe(s), 'g');
const common = [
  [all(PLACEHOLDER.name), name],
  [all(`www.${PLACEHOLDER.domain}`), `www.${domain}`],
  [all(PLACEHOLDER.domain), domain],
];

const urlName = name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || slug;
let official = null;
if (flags.roblox) official = `https://www.roblox.com/games/${flags.roblox}/${urlName}`;
if (flags.steam) official = `https://store.steampowered.com/app/${flags.steam}/${urlName.replace(/-/g, '_')}/`;
const platform = flags.steam ? 'Steam' : 'Roblox';

const siteEdits = [[all(PLACEHOLDER.name), tsName], ...common.slice(1)];
if (official) siteEdits.push([/official: '[^']*'/, `official: '${official}'`]);
else warn('没给 --roblox / --steam：src/config/site.ts 的 official 还是 <placeId> 占位——每日巡检靠它认游戏，上线前必须填');
if (flags.steam) {
  siteEdits.push([/platform: 'Roblox'/, `platform: '${platform}'`]);
  siteEdits.push([/ or Roblox Corporation/g, '']);
}
rewrite('src/config/site.ts', siteEdits);
rewrite('src/locales/en.json', flags.steam ? [...common, [/ or Roblox Corporation/g, '']] : common);
rewrite('public/manifest.json', common);
rewrite('wrangler.jsonc', [[/("name":\s*)"[^"]*"/, `$1"${slug}"`], ...common]);
rewrite('package.json', [[/("name":\s*)"[^"]*"/, `$1"${slug}"`], [/("version":\s*)"[^"]*"/, '$1"0.1.0"'], [/("description":\s*)"[^"]*"/, `$1"${name} fan wiki (${domain}) — built from Ship/game-template-anvil."`]]);
for (const dir of ['src/content/wiki']) {
  const walk = (d) => {
    for (const e of readdirSync(join(target, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.mdx')) rewriteMdx(rel);
    }
  };
  walk(dir);
}
rewrite('tests/seo.test.ts', [[all(PLACEHOLDER.name), name]], { required: false });

function rewriteMdx(rel) {
  const path = join(target, rel);
  const lines = readFileSync(path, 'utf8').split('\n');
  let inFm = false;
  const out = lines.map((line, i) => {
    if (line === '---') inFm = i === 0 ? true : false;
    const quoted = inFm && /:\s*'/.test(line);
    let l = line.replace(all(PLACEHOLDER.name), quoted ? yamlName : name);
    for (const [re, rep] of common.slice(1)) l = l.replace(re, rep);
    return l;
  });
  writeFileSync(path, out.join('\n'));
}

const officialLine = official ?? `https://www.roblox.com/games/<placeId>/…（待填）`;
writeFileSync(
  join(target, 'README.md'),
  `# ${name} Wiki

${name} 的粉丝攻略站 · ${domain}

- **模板**：Ship/game-template-anvil（AnvilWiki · Astro 7 → Cloudflare Workers）——版本见 \`.template.json\`
- **主题**：\`${theme.id}\`（Ship/game-themes，${theme.pickedBy === '--theme' ? '手动指定' : 'pick.mjs 选'}）——换主题 / 同步主题：\`node scripts/sync-theme.mjs [--theme <id>]\`
- **官方游戏链接**：${officialLine}（\`src/config/site.ts\` 的 \`social.official\`，每日巡检靠它盯游戏更新）
- **部署**：git push main → CI 部署（见 AGENTS.md）

\`\`\`bash
pnpm install
pnpm dev                                   # http://localhost:4321
SITE_URL=https://${domain} pnpm build      # 不传 SITE_URL 也会回落到 https://${domain}
\`\`\`

改站规则、schema 限制和提交前清单见 [AGENTS.md](./AGENTS.md)。
`,
);
console.log('✓ 改写 site.ts / en.json / manifest.json / wrangler.jsonc / package.json / 占位文章 / README.md');

// ─── ⑤ 依赖 + 生成素材 ───────────────────────────────────────────────────────
let installed = false;
if (flags.noInstall) {
  warn('--no-install：没跑 pnpm install（lockfile 还没更新到新主题的字体包），提交前先 pnpm install');
} else {
  console.log('… pnpm install');
  installed = pnpmInstall(target);
  if (!installed) warn('pnpm install 失败（网络？可设 https_proxy=http://127.0.0.1:7897 后重跑）：lockfile 还没更新，提交前必须 pnpm install');
}
if (installed) {
  if (!pnpmRun(target, 'gen-assets')) warn('pnpm gen-assets 失败：favicon / public/images/hero.webp 还是模板的，之后手动重跑');
  if (!pnpmRun(target, 'gen-covers')) warn('pnpm gen-covers 失败：文章封面之后手动 pnpm gen-covers');
}

// ─── ⑥ .theme.json + git ─────────────────────────────────────────────────────
writeFileSync(
  join(target, '.theme.json'),
  JSON.stringify({ id: theme.id, pickedBy: theme.pickedBy, hits: theme.hits, themesCommit: themesCommit(themesDir) }, null, 2) + '\n',
);
const git = (...args) => execFileSync('git', args, { cwd: target, stdio: ['ignore', 'ignore', 'inherit'] });
git('init', '-q', '-b', 'main');
git('add', '-A');
git('commit', '-q', '-m', `chore: scaffold ${name} (${domain}) from game-template-anvil, theme ${theme.id}`);
console.log('✓ git init + 首次提交');

// ─── 清单 ────────────────────────────────────────────────────────────────────
const relPath = relative(process.cwd(), target);
const rel = !relPath ? '.' : relPath.startsWith('..') ? target : relPath;
const steps = [
  `cd ${rel}${installed ? '' : ' && pnpm install'} && pnpm dev —— 本地看一眼首页和文章页（主题 ${theme.id}）`,
  official ? `官方游戏链接已写：${official}` : '填 src/config/site.ts 的 official（roblox.com/games/<placeId>/… 或 store.steampowered.com/app/<appid>/）——巡检靠它认游戏',
  '改 src/config/site.ts（developer / genre / tagline）和 src/locales/en.json（首页文案、FAQ），删掉占位文章，按 AGENTS.md 写内容（badge API 拿实体名单）。首页 title / description / hero / tagline 别写 codes——codes 词只给 codes 页，首页带上会把它的词全抢走（dropafruit / animemysterious 2026-10）',
  '官方美术：Roblox /v1/games/<universeId>/media 截图 → src/assets/brand/cover-bg.png（首页 hero + 封面底图），badge 图标 → src/assets/brand/<category>-<slug>.png，然后 pnpm gen-covers',
  'codes 站：src/config/watch.json 填 2+ 个码源 + groupId，cron 每小时跑 node scripts/game-watch.mjs',
  '提交前：pnpm typecheck && pnpm build && pnpm test && pnpm check-links && pnpm template-audit（+ AGENTS.md 的孤岛页检查）',
  `建 GitHub 私有仓库 ken-fs/${slug} → python3 ~/Desktop/david/Ship/scripts/setup-gh-deploy.py ${target} ken-fs/${slug} ${domain}（写 deploy.yml + 加密 secret）→ git push`,
  `Cloudflare：zone ${domain} 先 active，再让第一次部署带上 wrangler.jsonc 的 routes（主域 + www）；强制 HTTPS / TLS1.2；python3 ~/Desktop/david/Ship/scripts/cf-www-redirect.py 配 www 301`,
  `GSC：node ~/Desktop/david/Ship/scripts/gsc-verify-domain.mjs ${domain}；IndexNow：node ~/Desktop/david/Ship/scripts/indexnow.mjs ${domain}；GA：构建变量 PUBLIC_GA_ID`,
  `上线验收（必做，全 ✓ 才算完成）：cd ~/Desktop/david/Ship && node scripts/site-onboard.mjs ${domain} --game`,
];
console.log(`\n新站已生成：${name} · ${domain} · 主题 ${theme.id} · ${target}`);
if (warnings.length) console.log(`\n⚠ 需要注意（${warnings.length}）：\n${warnings.map((w) => `  - ${w}`).join('\n')}`);
console.log('\n剩余步骤：');
steps.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s}`));
console.log('');
