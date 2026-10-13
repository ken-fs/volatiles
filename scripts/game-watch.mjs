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
import { basename, dirname, join } from 'node:path';
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
      if (i >= (limited ? 3 : 2)) {
        // 大站常见「封机房 IP」（403/429/503）——Jina 读取代理兜底一次（同 aistatement 的重抓链）
        if (/HTTP (403|429|503)/.test(e.message)) {
          try {
            const jr = await fetch(`https://r.jina.ai/${url}`, { signal: AbortSignal.timeout(45000) });
            if (jr.ok) {
              const body = await jr.text();
              // Jina 对目标页 404/5xx 也返回 200，正文里带这句——别把它当抓取成功
              if (!/Target URL returned error/.test(body)) return body;
            }
          } catch { /* 兜底也失败就按原错误抛出 */ }
        }
        throw new Error(`${url.slice(0, 60)}: ${e.message}`);
      }
      await new Promise((res) => setTimeout(res, limited ? 20000 * i : 2500 * i));
    }
  }
}

/** 从码源 HTML 里抽候选码：全大写 4–32 位、至少含一个字母，剔除页面词汇。
 *  上限 32：THANKSFOR20KMEMBERDISCORD 这类里程碑码有 25 字符，上限太小会静默漏掉并误报 GONE。 */
function extractCodes(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
  const out = new Set();
  for (const m of text.matchAll(/\b[A-Z0-9]{4,32}\b/g)) {
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
// 页面正文里用反引号记过的码（过期清单、命名例子）也算已知——否则它们会被反复报成新候选
for (const m of mdx.matchAll(/`([A-Z][A-Z0-9_]{3,31})`/g)) known.add(m[1]);
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
  // 兼容两种写法：{"id","url"} 对象，或纯 URL 字符串（new-site 生成的模板默认写法）
  const src = typeof s === 'string' ? { id: new URL(s).hostname, url: s } : s;
  try {
    perSource[src.id] = extractCodes(await get(src.url));
  } catch (e) {
    sourceErrors.push(`${src.id}: ${e.message}`);
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

// 监控自身健康：源抓取成功数写进 state，巡检/降级告警都靠它
const sourceHealth = {
  ok: CODE_SOURCES.length - sourceErrors.length,
  total: CODE_SOURCES.length,
  errors: sourceErrors,
};
// 同一个「哪些源坏了」签名只通知一次；恢复后清零，再坏再通知
const degradedSig =
  sourceHealth.errors.length >= 2
    ? sourceHealth.errors.map((e) => e.split(':')[0]).sort().join(',')
    : '';

writeFileSync(
  STATE,
  JSON.stringify(
    {
      game: now,
      knownCodes: [...known].sort(),
      newCandidates,
      sourceHealth,
      degradedNotifiedFor: degradedSig || null,
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
// 2026-10-13：变化不再推「请手动更新」，直接交给自动更新引擎（Ship/scripts/autopilot）：它多源确认后改码表、
// 构建、上线，再推飞书告诉用户改了什么。引擎不在（模板单独拿出去用）才退回原来的通知。
const autoReasons = [];
const AUTOPILOT = join(SHIP, 'scripts', 'autopilot', 'trigger.mjs');
const handoff = (reason) => autoReasons.push(reason);
if (changed.length) {
  const isUpdate = changed.includes('updated') || changed.includes('description');
  for (const k of changed) {
    log(`CHANGED ${k}: ${JSON.stringify(String(prev.game?.[k] ?? '').slice(0, 120))} → ${JSON.stringify(String(now[k]).slice(0, 120))}`);
  }
  handoff(`${GAME} ${isUpdate ? '游戏更新' : '数据源变化'}（${changed.join('/')}${changed.includes('shout') ? `，群组公告：${now.shout.slice(0, 150)}` : ''}）`);
}

if (stalePage) {
  log(`STALE_CODES page ${pageLastModified} < game ${gameDay}`);
  handoff(`codes 页 ${pageLastModified} 落后于游戏更新 ${gameDay}`);
}

if (degradedSig && prev.degradedNotifiedFor !== degradedSig) {
  log(`SOURCE_DEGRADED ${sourceHealth.ok}/${sourceHealth.total} ok | ${sourceErrors.join(' | ')}`);
  notify(
    `⚠️ ${GAME} 码监控源降级`,
    `${sourceHealth.ok}/${sourceHealth.total} 个码源可抓——监控可能漏新码，尽快换源：${sourceErrors.slice(0, 2).join('；')}`,
    'Bong',
  );
}

if (newCandidates.length) {
  log(`🚨 NEW_CODES ${newCandidates.join(' ')}`);
  handoff(`码源出现本站没有的码 ${newCandidates.slice(0, 8).join(' ')}`);
}

if (autoReasons.length) {
  if (gone.length) autoReasons.push(`这些码各源都不再列出，核实是否过期：${gone.join(' ')}`);
  let handed = false;
  if (existsSync(AUTOPILOT)) {
    try {
      const { trigger } = await import(AUTOPILOT);
      handed = autoReasons.every((r) => trigger(basename(REPO), r));
    } catch {}
  }
  if (handed) log(`AUTOPILOT ${autoReasons.join(' | ')}`);
  else notify(`🆕 ${GAME} 有变化`, `${autoReasons.join('；')} → 多源确认后更新 codes 页`, 'Sosumi');
}
if (gone.length) log(`GONE ${gone.join(' ')}（所有成功抓取的源都不再列出，人工确认后标过期）`);
if (sourceErrors.length) log(`SOURCE_ERRORS ${sourceErrors.join(' | ')}`);
if (!changed.length && !newCandidates.length && !stalePage) log('no change');
