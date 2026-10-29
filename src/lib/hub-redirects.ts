/**
 * Category hubs that list a single article get folded into that article.
 *
 * A /codes/ hub whose only card is /codes/all-codes/ is a thin duplicate of
 * the article it links to. 2026-10-23 dropafruit: the hub canonical'd to the
 * article but still shipped in the sitemap and took every nav / home / crumb
 * link — GSC had the hub at "URL is unknown to Google" and the article at
 * "Discovered – currently not indexed", while the homepage ranked 7–8 for
 * every codes query instead. animemysterious had the same split.
 *
 * Those hubs now 301 to the article (astro.config writes dist/_redirects),
 * are not built (so the sitemap drops them too), and every category link goes
 * through categoryHref() straight to the article. A second article in the
 * category turns the hub back into a real overview page automatically.
 *
 * Deliberately IMPORT-FREE: astro.config.ts loads it at config time, before
 * the `~` alias exists (same constraint as lib/tag-redirects.ts).
 */

export interface HubSourceEntry {
  locale: string;
  category: string;
  slug: string;
}

/** locale → (category → slug of its only article). Only published entries go in. */
export function computeHubRedirects(
  entries: HubSourceEntry[],
  categories: readonly string[],
): Map<string, Map<string, string>> {
  const slugs = new Map<string, string[]>();
  for (const e of entries) {
    if (!categories.includes(e.category)) continue;
    const key = `${e.locale}\u0000${e.category}`;
    if (!slugs.has(key)) slugs.set(key, []);
    slugs.get(key)!.push(e.slug);
  }
  const out = new Map<string, Map<string, string>>();
  for (const [key, list] of slugs) {
    if (list.length !== 1) continue;
    const [locale, category] = key.split('\u0000') as [string, string];
    if (!out.has(locale)) out.set(locale, new Map());
    out.get(locale)!.set(category, list[0]!);
  }
  return out;
}

/**
 * Cloudflare `_redirects` lines (both slash forms) for the folded hubs.
 * Paths mirror lib/url's localizePath: default locale unprefixed, trailing
 * slash on the target.
 */
export function hubRedirectLines(redirects: Map<string, Map<string, string>>, defaultLocale: string): string[] {
  const lines: string[] = [];
  for (const [locale, map] of [...redirects].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const prefix = locale === defaultLocale ? '' : `/${locale}`;
    for (const [category, slug] of [...map].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
      const from = encodeURI(`${prefix}/${category}`);
      const to = encodeURI(`${prefix}/${category}/${slug}/`);
      lines.push(`${from} ${to} 301`, `${from}/ ${to} 301`);
    }
  }
  return lines;
}
