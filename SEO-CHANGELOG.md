# SEO 改动台账 · volatiles.wiki

每次 SEO 调整记一条：为什么、预期、复查日、指标。到期补结果。

## 2026-11-17 · 标题月份改成从核对日期自动算

**为什么**：11-07 扫到、11-17 线上仍是：标题里的月份是手写的，自动更新（autopilot）核对码 / 数据时只改日期字段、按规矩不碰标题，月份就停在上个月。标题月份过期会让人觉得页面没人管（codes / tier list 这类词大家按月搜），也和页面上的核对日期对不上。

**改了什么**
- 同步 game-template-anvil 0d7b70f：frontmatter 认 `{month}`（取 lastModified，没有就取 date）
- /guides/everything-we-know/：「Volatiles: everything we know (October 2026)」改写成 `({month})`，description「as of October 2026」同步；这页只有 date 2026-10-11，线上暂时仍是 October，已交给自动更新引擎查 Steam 新闻后补 lastModified

**预期**：以后核对过这页（改核对日期 / lastModified）标题月份自动跟上，不用再手改；每日巡检（seo-structure ⑧）标题月份早于上个月就点名。GSC 里这些页的 CTR 不降，codes / tier list 词的点击有机会小涨。

**复查**：📅 2026-12-01（线上标题是不是 November / December；12-01 后巡检有没有点名这些页；GSC 这几页 28 天 CTR / 点击对比 11-17 前）

**当天跟进**：2f2b9db：autopilot 查 Steam 新闻（10-11 后没有新消息），加 lastModified: 2026-11-17，线上变成 November 2026。

**结果**：（待补）
