# 本仓库是 Ship 的游戏站模板 game-template-anvil（或由它生成的站）

所有 agent（Claude Code / Codex / pi …）通用规则以 `~/Desktop/david/Ship/AGENTS.md` 开头的「🧭 建站铁律」为准，开工前先读；路径 A 的 SOP（数据源纪律、内容写作、官方素材、部署坑）在同一文件的「Roblox 攻略站建站 SOP」。这里只写本仓库特有的东西。

## 模板 vs 生成的站

- **这里是模板仓库**（根目录有 `TEMPLATE.md` + `CHANGELOG.md`，没有 `.template.json`）：改动就是给以后所有新站改。修 bug 的提交信息以 `fix` 开头——用本模板建的站每天巡检会被点名「模板有修复、还没同步」。不要留未提交的改动（Ship 的 `new-site.mjs` 会拒绝用脏模板建站）。改完在 `CHANGELOG.md` 记一笔
- **这里是由模板生成的站**（根目录有 `.template.json`）：修了一个 bug，先想它是不是模板带来的——是就回 `~/Desktop/david/Ship/game-template-anvil` 修同样的问题并提交（`fix: …`），下一个站就不会再踩
- 建新站只走 `node ~/Desktop/david/Ship/scripts/new-site.mjs game-anvil <slug> <域名> -- --name "Game Name" --roblox <placeId> --keywords "..."`。不要直接跑本仓库的 `scripts/new-site.mjs`、也**不要 cp 现有站**
- 上线最后一步：`node ~/Desktop/david/Ship/scripts/site-onboard.mjs <域名> --game`，全 ✓ 才算完成
- 部署 = git commit + push（提交前 `git status` 看未跟踪文件，非预期的删掉）

## 主题（Ship/game-themes）

- 主题文件 `src/styles/theme/base.css` 和 `src/styles/theme/theme.css` 是 `game-themes/base.css` 和 `game-themes/tokens/<id>.css` 的**原样副本**。**不要在站里改它们**——改主题先在 `~/Desktop/david/Ship/game-themes` 改并提交，再在各站跑 `node scripts/sync-theme.mjs`（换主题：`--theme <id>`）。它会同步文件、换字体包、重出 favicon/OG 图、更新 `.theme.json` / `.template.json` 的 `theme` + `themesCommit`
- 主题库是 Tailwind v4 写法（`@theme {}`）；本模板是 Tailwind v3，`postcss.config.mjs` 把 `@theme` 转成 `:root`，所以文件不用手改
- **桥接层** `src/styles/globals.css`：AnvilWiki 的变量（`--background` `--foreground` `--card` `--muted` `--border` `--brand` `--brand-text` `--on-brand`）全部指向主题 token（`paper` `ink` `card` `rule` `rust` …）。Tailwind 颜色（`bg-card` `text-nav` `border-border` `bg-primary/10`，以及 `text-rust` `bg-ochre` `border-rule` 等 token 名）都是变量
- **组件里不写死颜色**：不用 hex / rgb / Tailwind 调色板类（`text-red-600`、`bg-amber-500/10`）/ `dark:` 变体——`tests/theme.test.ts` 会拦。状态色用 `chip-good` / `chip-bad` / `chip-warn` 或 `moss` / `rust` / `ochre`
- 类名契约：`.card`（可点）`.tile`（不可点）`.tag` `.btn-ember`（主按钮）`.hero-glow`（首屏装饰，内放 3 个 `<span>`）、`table.data` `.nav-link` `.arrow-link` `.glass`。**`.card` / `.tile` 上别再加 `border` / `rounded-*` / `bg-*` / `shadow-*`**，会盖掉主题；只加间距类
- 每套主题配色固定（没有明暗切换）：`src/lib/theme.ts` 在构建时按 `--color-paper` 亮度给 `<html>` 加 `.dark`、`color-scheme` 和 `<meta theme-color>`
- 强调色当**文字**用 `text-nav`（`--brand-text`，和 ink 混过，所有主题都过 AA）；当**色块**用 `bg-primary` / `bg-rust`，色块上的字用 `text-primary-foreground`
- 视觉别有 AI 味：不用全大写加字距的小标签、不全居中、不加紫色渐变（见 `game-themes/THEMES.md`「每套的硬规则」）

## 分层（AnvilWiki 原则，保留）

```
Code layer    (src/pages, src/components, src/lib)                — 不放任何游戏专属字符串
Config layer  (src/config, src/i18n/routing.ts, public/)          — 每个游戏改一次
Content layer (src/content, src/locales)                          — 每个游戏整体替换
Theme layer   (src/styles/theme/*)                                — 只经 sync-theme.mjs 改
```

- UI 文案全部走 `src/locales/<locale>.json`，组件里不硬编码文字；UI 不用 emoji，图标用 lucide（`astro-icon`）
- 分类 key 三处一致：`src/config/navigation.ts` 的 `NAVIGATION_CONFIG[].key` = `en.json` 的 `nav.<key>` + `overview.<key>` = `src/content/wiki/<locale>/<key>/` 目录名；新分类先有文章再进 navigation
- 文章正文从 H2 起（H1 由 frontmatter `title` 渲染）
- 广告 / 评论 / GA 都走 env 变量，空值 = 不渲染；GA 用 `PUBLIC_GA_ID`，**同意门控**（`BaseLayout` 定义 `window.__awLoadTrackers`，`CookieConsent` 点接受后才注入；`gtag()` 推的是 `arguments`，别改成数组——2026-10-01 六个站 GA 零数据就是这个）
- `src/config/site.ts` 的 `social.official` **必填**，保持单引号一行：`official: 'https://www.roblox.com/games/<placeId>/…'` 或 `store.steampowered.com/app/<appid>/`——Ship 每日巡检靠它比对「游戏更新了、站没跟」

## schema 限制（构建时 Zod 硬校验，`src/content.config.ts`）

| 字段 | 限制 | 踩坑 |
|---|---|---|
| `title` | ≤ 80 字符 | — |
| `description` | **40–165 字符** | — |
| `gameVersion` | **≤ 20 字符** | `'Update 2 (Ranked & Guilds)'` = 27 字符（commandanarmy） |
| `category` | 必须是 `navigation.ts` 的 key | — |
| `summary` | **≤ 400 字符** | 402 字符中招（commandanarmy 2026-09-24），`check-content` 不查 |
| `videos[]` | 11 字符 YouTube ID，不是 URL | — |
| `codes[].status` | `active` / `expired` | — |

⚠️ `pnpm check-content` 的长度校验比 Zod 宽松——**以 `pnpm build` 为准**，别信 check-content 就提交。

## 提交前清单

```bash
pnpm typecheck        # 0 error
pnpm lint
pnpm test             # 含 tests/theme.test.ts（主题契约 + 组件无写死颜色）
pnpm build            # 真正的 schema 门禁；postbuild 写 dist/.well-known/anvilwiki-deploy.txt = git HEAD
pnpm check-links      # dist/ 内链全通
pnpm check-content
pnpm template-audit   # 换皮残留
```

孤岛页检查（入站内链为 0 的页，模板没有这个门禁；每日巡检也会查）：

```bash
python3 - <<'PY'
import re,glob,collections,os
inbound=collections.Counter(); pages=set()
for f in glob.glob('src/content/wiki/en/*/*.mdx'):
    pages.add(f"/{os.path.basename(os.path.dirname(f))}/{os.path.basename(f)[:-4]}/")
for f in glob.glob('src/content/wiki/en/*/*.mdx'):
    for m in re.findall(r'\]\((/[a-z0-9\-/]+/)\)', open(f).read()): inbound[m]+=1
orphans=sorted(p for p in pages if inbound[p]==0)
print(f"孤岛页 {len(orphans)}/{len(pages)}" + (" → "+", ".join(orphans) if orphans else " ✅"))
PY
```

## 命令

```bash
pnpm dev              # http://localhost:4321
pnpm build            # SITE_URL 可不传：回落到 https://<site.domain>
pnpm gen-covers       # 文章封面（强调色取主题 --color-rust；有 src/assets/brand/ 官方图就用作底图/图标）
pnpm gen-assets       # favicon 全套 + public/images/hero.webp + manifest theme_color
pnpm sync-theme       # = node scripts/sync-theme.mjs
pnpm game-watch       # = node scripts/game-watch.mjs（Roblox 元数据 + 码源比对，配置 src/config/watch.json）
pnpm new-post         # 交互式新建文章
pnpm sync-codes       # codes-sync.csv 批量改 codes 页
pnpm refresh-audit    # 新鲜度报告（codes 页 >7 天）
pnpm submit-indexnow  # IndexNow 手动推送
```

封面重新生成：先删 frontmatter 的 `image:` 行（已有 `image:` 的文章会被当成自备封面跳过）：
`sed -i '' "/^image: '\.\.\/\.\.\/\.\.\/\.\.\/assets\/covers\//d" src/content/wiki/en/*/*.mdx && pnpm gen-covers`

## Astro Content Layer 坑（AnvilWiki 实测）

1. `entry.id` 带 `.mdx`，但 `getEntry()` 要不带扩展名的 id（`parseEntryId` 已处理）
2. 没有 `entry.render()`，用 `import { render } from 'astro:content'`
3. `getStaticPaths()` 编译成独立模块，看不到文件顶层的 `const`——数据内联进函数体
4. rest 参数读 `Astro.params.slug`，不是 `Astro.props`
5. `prefixDefaultLocale: false`：`/` 就是英文首页，别重定向到 `/en/`
6. satori（gen-covers）的 `img` 要把 `src/width/height` 放 props 层级，不是 style
