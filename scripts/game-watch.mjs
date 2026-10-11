#!/usr/bin/env node
/**
 * 游戏变化监控（零 AI、零依赖、配置驱动）—— 每个 codes 站一份，从模板带来。
 * 抽象自 raceforeggs/scripts/game-watch.mjs（2026-10-11）：那份写死了游戏 ID 和码源。
 *
 * 为什么：/codes/ 往往是游戏站唯一有真实搜索意图的页；游戏一更新就掉新码，竞品几小时内收录。
 * raceforeggs 建站后停更 22 天、codes 页落后，GSC 点击 -85%。这个脚本每小时：
 *
 *   1. Roblox 元数据比对（名称/描述/版本时间/群组 shout）：更新 = 新码信号；
 *      同时检查 codes 页 lastModified 是否落后于游戏 updated
 *   2. 码源页比对：出现「本站还没有、且 ≥2 个源同时列出」的码 → 高优先级通知
 *   3. 本站已收录的码在所有源上都消失 → 记日志（可能过期，人工确认）
 *
 * 只提示，不自动改 MDX。配置：
 *   - 游戏：src/config/site.ts 的 social.official（roblox.com/games/<placeId>/…）
 *   - 码源 / 群组 / 停用词：src/config/watch.json
 * 通知先推飞书（Ship/scripts/notify.mjs），推不出去走 macOS 通知。
 *
 * cron: 29 * * * * NODE_USE_ENV_PROXY=1 https_proxy=http://127.0.0.1:7897 /opt/homebrew/bin/node <本文件>
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SHIP = join(REPO, '..');
const CFG = JSON.parse(readFileSync(join(REPO, 'src', 'config', 'watch.json'), 'utf8'));
const SLUG = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).name;
const siteTs = readFileSync(join(REPO, 'src', 'config', 'site.ts'), 'utf8');
const OFFICIAL = siteTs.match(/official:\s*'([^']+)'/)?.[1] ?? '';
const GAME = siteTs.match(/\bgame:\s*\{\s*name:\s*'([^']+)'/)?.[1] ?? SLUG;
const PLACE_ID = OFFICIAL.match(/roblox\.com\/games\/(\d+)/)?.[1];
if (!PLACE_ID) {
  console.log(`game-watch: ${OFFICIAL || '(no official URL)'} 不是 Roblox 游戏链接（或还是 <placeId> 占位），跳过`);
  process.exit(0);
}
const GROUP_ID = CFG.groupId ?? null;
const CODES_FILE = join(REPO, CFG.codesFile ?? 'src/content/wiki/en/codes/all-codes.mdx');
const CODE_SOURCES = CFG.codeSources ?? [];
mkdirSync(join(SHIP, 'out'), { recursive: true });
const STATE = join(SHIP, 'out', `${SLUG}-watch.json`);
const LOG = `/tmp/${SLUG}-watch.log`;

// 全大写 token 里这些不是码（页面词汇）。注意别把真码停掉：RELEASE 是码，
// TRAIN1/LUCK1/UPD1 带数字本来就会被 knownCodes 拦住。
const STOP = new Set(
  `COPY NEW CODES CODE WORKING ACTIVE EXPIRED REDEEM FREEBIES CLAIM LIST HERE TABLE
   STATUS ENTER BONUS MORE INFO NOTE READ WHEN WHERE WHAT WHY HOW ALL USE UPDATED
   UPDATE ROBLOX DISCORD PRIVACY CONTACT HOME GUIDES WIKI TIER TIERS REWARD REWARDS
   PLAYERS PLAYER SATURDAY WEEKEND OCTOBER NOVEMBER SEPTEMBER DECEMBER JANUARY
   FEBRUARY MARCH APRIL MAY JUNE JULY AUGUST AND THE FOR YOU YOUR WITH THIS THAT
   FROM HAVE WILL JUST ONLY OVER ALSO INTO START STARTER FIRST BEST TOP NEXT LAST
   GAME GAMES ITEM ITEMS MODE MODES PRESS OPEN CURRENT LATEST SHOP MENU GAMEPASS
   BADGE BADGES STAGE STAGES WORLD WORLDS THUMBNAIL VIDEO FACEBOOK TWITTER YOUTUBE
   GOOGLE XBOX PLAYSTATION NINTENDO MOBILE DESKTOP CHEATS NEWS PATCH PATCHES EVENT
   EVENTS TOTAL NUMBER COUNT ${(CFG.stopWords ?? []).join(' ').toUpperCase()}`.split(/\s+/),
);

const log = (msg) => appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);

const PUSH_SCRIPT = join(SHIP, 'scripts', 'notify.mjs');

function notify(title, body, sound = 'Glass') {
  // 先推飞书（Ship/scripts/notify.mjs，2026-10-11 加：用户不在电脑前会漏 macOS 通知）；推不出去再走下面的 macOS 通知。
  try {
    execFileSync(process.execPath, [PUSH_SCRIPT, '--title', String(title), '--body', String(body)], { stdio: 'ignore', timeout: 30000 });
    return;
  } catch {}
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 220);
  try {
    execFileSync('osascript', [
      '-e',
      `display notification "${esc(body)}" with title "${esc(title)}" sound name "${sound}"`,
    ]);
  } catch {}
}

// Roblox API 偶发瞬时 SSL 错误 → 短重试；429 限流（雷达每天 13 点前后扫 Roblox）→ 长等待
async function getJson(url) {
  for (let i = 1; ; i++) {
    let limited = false;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      limited = r.status === 429;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= (limited ? 5 : 3)) throw new Error(`${url}: ${e.message}`);
      await new Promise((res) => setTimeout(res, limited ? 30000 * i : 3000 * i));
    }
  }
}

async function get(url) {
  for (let i = 1; ; i++) {
    let limited = false;
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        },
      });
      limited = r.status === 429;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i >= (limited ? 3 : 2)) throw new Error(`${url.slice(0, 60)}: ${e.message}`);
      await new Promise((res) => setTimeout(res, limited ? 20000 * i : 2500 * i));
    }
  }
}

/** 从码源 HTML 里抽候选码：全大写 4–20 位、至少含一个字母，剔除页面词汇。 */
function extractCodes(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
  const out = new Set();
  for (const m of text.matchAll(/\b[A-Z0-9]{4,20}\b/g)) {
    const tok = m[0];
    if (!/[A-Z]/.test(tok)) continue; // 纯数字不是码
    if (STOP.has(tok)) continue;
    if (/^\d+[A-Z]?$/.test(tok)) continue;
    out.add(tok);
  }
  return out;
}

// ─── 本站码表 + codes 页新鲜度（MDX 是唯一事实来源） ──────────────────────────
const mdx = existsSync(CODES_FILE) ? readFileSync(CODES_FILE, 'utf8') : '';
const known = new Set(
  [...mdx.matchAll(/^\s*-\s*code:\s*['"]?([A-Za-z0-9_]+)['"]?\s*$/gm)].map((m) => m[1]),
);
const pageLastModified = mdx.match(/^lastModified:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ?? null;

// ─── 1. Roblox 元数据 ─────────────────────────────────────────────────────────
let UNIVERSE_ID;
try {
  UNIVERSE_ID = (await getJson(`https://apis.roblox.com/universes/v1/places/${PLACE_ID}/universe`)).universeId;
} catch (e) {
  log(`UNIVERSE_FETCH_FAILED ${e.message}`);
  process.exit(1);
}
let now;
try {
  const [game, group] = await Promise.all([
    getJson(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE_ID}`).then((d) => d.data[0]),
    GROUP_ID ? getJson(`https://groups.roblox.com/v1/groups/${GROUP_ID}`) : Promise.resolve({}),
  ]);
  now = {
    name: game.name,
    description: game.description,
    updated: game.updated,
    playing: game.playing,
    visits: game.visits,
    shout: group.shout?.body ?? '',
    pageLastModified,
  };
} catch (e) {
  log(`GAME_FETCH_FAILED ${e.message}`);
  process.exit(1);
}

// ─── 2. 码源比对 ──────────────────────────────────────────────────────────────
const perSource = {};
const sourceErrors = [];
for (const s of CODE_SOURCES) {
  try {
    perSource[s.id] = extractCodes(await get(s.url));
  } catch (e) {
    sourceErrors.push(`${s.id}: ${e.message}`);
  }
}

const counts = new Map();
for (const set of Object.values(perSource)) {
  for (const tok of set) counts.set(tok, (counts.get(tok) ?? 0) + 1);
}
// 出现在 ≥2 个源、且不在本站码表里的 → 新码候选
const newCandidates = [...counts.entries()]
  .filter(([tok, n]) => n >= 2 && !known.has(tok))
  .map(([tok, n]) => `${tok}(${n}源)`)
  .sort();

// 我们的码里，已从所有成功抓取的源上消失的 → 可能过期
const liveSources = Object.values(perSource);
const gone = liveSources.length
  ? [...known].filter((c) => liveSources.every((s) => !s.has(c)))
  : [];

// ─── 3. 状态比对 + 通知 ───────────────────────────────────────────────────────
const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;

// 游戏 updated 晚于 codes 页 lastModified = 页还没跟上这次更新（每个版本只提醒一次）
const gameDay = now.updated.slice(0, 10);
const stalePage = Boolean(
  pageLastModified && prev && pageLastModified < gameDay && prev.staleNotifiedFor !== gameDay,
);

writeFileSync(
  STATE,
  JSON.stringify(
    {
      game: now,
      knownCodes: [...known].sort(),
      newCandidates,
      staleNotifiedFor: stalePage ? gameDay : prev?.staleNotifiedFor ?? null,
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

if (!prev) {
  log(
    `BASELINE ${now.name} | updated ${now.updated} | codes ${[...known].join(',')} | candidates ${newCandidates.length}`,
  );
  process.exit(0);
}

const changed = ['name', 'description', 'updated', 'shout'].filter((k) => prev.game?.[k] !== now[k]);
if (changed.length) {
  const isUpdate = changed.includes('updated') || changed.includes('description');
  for (const k of changed) {
    log(`CHANGED ${k}: ${JSON.stringify(String(prev.game?.[k] ?? '').slice(0, 120))} → ${JSON.stringify(String(now[k]).slice(0, 120))}`);
  }
  notify(
    isUpdate ? `🆕 ${GAME} 更新` : `${GAME} 数据源有变化`,
    `${changed.join('/')} 变化 → 查新码并同步 codes 页（正文 ${pageLastModified ?? '?'}）`,
    isUpdate ? 'Glass' : 'Blow',
  );
}

if (stalePage) {
  log(`STALE_CODES page ${pageLastModified} < game ${gameDay}`);
  notify(
    '🔔 codes 页落后于游戏更新',
    `页面 ${pageLastModified}，游戏已更新到 ${gameDay} → 同步新码/日期（多源确认后改 codes 页）`,
    'Glass',
  );
}

if (newCandidates.length) {
  log(`🚨 NEW_CODES ${newCandidates.join(' ')}`);
  notify(
    `🚨 ${GAME} 新码待确认`,
    `${newCandidates.slice(0, 8).join(' ')} → 双源确认后补进 codes 页（含标题日期）`,
    'Sosumi',
  );
}

if (gone.length) log(`GONE ${gone.join(' ')}（所有成功抓取的源都不再列出，人工确认后标过期）`);
if (sourceErrors.length) log(`SOURCE_ERRORS ${sourceErrors.join(' | ')}`);
if (!changed.length && !newCandidates.length && !stalePage) log('no change');
