# Volatiles Wiki

Volatiles 的粉丝攻略站 · volatiles.wiki

- **模板**：Ship/game-template-anvil（AnvilWiki · Astro 7 → Cloudflare Workers）——版本见 `.template.json`
- **主题**：`terminal`（Ship/game-themes，手动指定）——换主题 / 同步主题：`node scripts/sync-theme.mjs [--theme <id>]`
- **官方游戏链接**：https://store.steampowered.com/app/4210390/Volatiles/（`src/config/site.ts` 的 `social.official`，每日巡检靠它盯游戏更新）
- **部署**：git push main → CI 部署（见 AGENTS.md）

```bash
pnpm install
pnpm dev                                   # http://localhost:4321
SITE_URL=https://volatiles.wiki pnpm build      # 不传 SITE_URL 也会回落到 https://volatiles.wiki
```

改站规则、schema 限制和提交前清单见 [AGENTS.md](./AGENTS.md)。
