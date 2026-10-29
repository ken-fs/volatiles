import { describe, it, expect } from 'vitest';
import { computeHubRedirects, hubRedirectLines, type HubSourceEntry } from '~/lib/hub-redirects';

const e = (category: string, slug: string, locale = 'en'): HubSourceEntry => ({ locale, category, slug });
const CATS = ['codes', 'guides'];

describe('computeHubRedirects', () => {
  it('folds a category with exactly one article into it', () => {
    const m = computeHubRedirects([e('codes', 'all-codes'), e('guides', 'a'), e('guides', 'b')], CATS);
    expect(m.get('en')!.get('codes')).toBe('all-codes');
    expect(m.get('en')!.has('guides')).toBe(false);
  });
  it('is per-locale', () => {
    const m = computeHubRedirects([e('codes', 'all-codes'), e('codes', 'x', 'ja'), e('codes', 'y', 'ja')], CATS);
    expect(m.get('en')!.get('codes')).toBe('all-codes');
    expect(m.get('ja')).toBeUndefined();
  });
  it('ignores directories that are not content types', () => {
    expect(computeHubRedirects([e('drafts', 'x')], CATS).size).toBe(0);
  });
});

describe('hubRedirectLines', () => {
  it('emits both slash forms, locale-prefixed outside the default locale', () => {
    const m = computeHubRedirects([e('codes', 'all-codes'), e('codes', 'all-codes', 'ja')], CATS);
    expect(hubRedirectLines(m, 'en')).toEqual([
      '/codes /codes/all-codes/ 301',
      '/codes/ /codes/all-codes/ 301',
      '/ja/codes /ja/codes/all-codes/ 301',
      '/ja/codes/ /ja/codes/all-codes/ 301',
    ]);
  });
});
