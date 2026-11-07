/**
 * Homepage freshness date + short FAQ (GEO, 2026-11-07).
 *
 * AI search (ChatGPT / Perplexity / AI Overviews) and Ship's geo-check want
 * the homepage to show a real "Last updated" date (+ JSON-LD dateModified)
 * and carry a FAQPage that mirrors a visible FAQ. Both come from real site
 * data here — newest article date, page counts per section, site config —
 * never hand-typed numbers that drift.
 *
 * Pure functions (no astro:content import) so tests/seo.test.ts can load them.
 */

export interface DatedLike {
  data: { date: Date; lastModified?: Date };
}

/** Newest real content date across articles (lastModified, else publish date). null when there are none. */
export function latestContentDate(entries: readonly DatedLike[]): Date | null {
  let best: Date | null = null;
  for (const e of entries) {
    const d = e.data.lastModified ?? e.data.date;
    if (!best || d.getTime() > best.getTime()) best = d;
  }
  return best;
}

/** "Nov 6, 2026" style — same format as the codes status card. */
export function formatHomeDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

/** Shape of `home.siteFaq` in the locale JSON. `{x}` placeholders are filled from site data. */
export interface SiteFaqStrings {
  title: string;
  coverQ: string;
  coverA: string;
  updatedQ: string;
  updatedA: string;
  officialQ: string;
  officialA: string;
  codesQ: string;
  codesA: string;
}

export interface HomeFaqFacts {
  locale: string;
  game: string;
  developer: string;
  /** Sections with at least one page, in nav order. */
  sections: Array<{ label: string; count: number }>;
  /** Formatted newest content date, or null. */
  updated: string | null;
  /** Title of the codes page when the site has exactly one; otherwise null (no codes question). */
  codesTitle: string | null;
}

const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

function listText(items: string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}

/** 3–4 Q&A built from site facts. Each answer is only included when the fact behind it exists. */
export function buildHomeFaq(s: SiteFaqStrings, f: HomeFaqFacts): Array<{ question: string; answer: string }> {
  const items: Array<{ question: string; answer: string }> = [];
  const vars = { game: f.game, developer: f.developer };
  const total = f.sections.reduce((n, x) => n + x.count, 0);
  if (total > 0) {
    items.push({
      question: fill(s.coverQ, vars),
      answer: fill(s.coverA, { ...vars, count: total, sections: listText(f.sections.map((x) => `${x.label} (${x.count})`), f.locale) }),
    });
  }
  if (f.updated) {
    items.push({ question: fill(s.updatedQ, vars), answer: fill(s.updatedA, { ...vars, date: f.updated }) });
  }
  if (f.developer) {
    items.push({ question: fill(s.officialQ, vars), answer: fill(s.officialA, vars) });
  }
  if (f.codesTitle) {
    items.push({ question: fill(s.codesQ, vars), answer: fill(s.codesA, { ...vars, title: f.codesTitle }) });
  }
  return items;
}
