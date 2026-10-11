/**
 * Theme contract (game-template-anvil 1.0.0) — the guarantees that make
 * "swap src/styles/theme/theme.css → the whole site restyles" true:
 *   1. The installed theme files exist and define every contract token.
 *   2. The PostCSS shim turns Tailwind-v4 `@theme {}` into `:root {}` (v3 build).
 *   3. Components use NO hard-coded colours (hex, rgb, Tailwind palette
 *      classes) that would fight the theme — tokens / bridge classes only.
 *   4. site.ts keeps `official:` as a single-quoted one-liner: Ship's daily
 *      patrol (site-hygiene.mjs) parses it with /official:\s*'([^']+)'/.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { describe, expect, test } from 'vitest';
import { parseThemeTokens, schemeForPaper, themeIdFromCss } from '../src/lib/theme-tokens';
import postcssConfig from '../postcss.config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const CONTRACT_TOKENS = [
  'color-paper', 'color-paper-edge', 'color-card', 'color-ink', 'color-ink-soft', 'color-ink-faint',
  'color-rule', 'color-rule-hard', 'color-rust', 'color-ember-lite', 'color-ochre', 'color-moss',
  'font-serif', 'font-sans', 'font-mono', 'font-code',
];

describe('installed game theme', () => {
  const css = read('src/styles/theme/theme.css');
  test('theme.css defines every contract token', () => {
    const tokens = parseThemeTokens(css);
    for (const t of CONTRACT_TOKENS) expect(tokens, `missing --${t}`).toHaveProperty(t);
  });
  test('theme.css carries the contract classes', () => {
    for (const cls of ['.card', '.tile', '.tag', '.btn-ember', '.hero-glow']) expect(css).toContain(cls);
  });
  test('theme id is readable and matches .theme.json', () => {
    const stamp = JSON.parse(read('.theme.json')) as { id: string };
    expect(themeIdFromCss(css)).toBe(stamp.id);
  });
  test('globals.css imports base + theme between preflight and utilities', () => {
    const g = read('src/styles/globals.css');
    const order = ["'tailwindcss/base'", "'./theme/base.css'", "'./theme/theme.css'", "'tailwindcss/utilities'"].map((s) =>
      g.indexOf(s),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('theme helpers', () => {
  test('schemeForPaper', () => {
    expect(schemeForPaper('#0b0c0b')).toBe('dark');
    expect(schemeForPaper('#0a5fc4')).toBe('dark');
    expect(schemeForPaper('#ffd23f')).toBe('light');
    expect(schemeForPaper('#fdf9f0')).toBe('light');
  });
});

describe('PostCSS @theme shim', () => {
  test('@theme { … } becomes :root { … }', async () => {
    const out = await postcss(postcssConfig.plugins).process('@theme { --color-paper: #000; }', { from: undefined });
    expect(out.css).toMatch(/^:root\s*\{\s*--color-paper: #000;?\s*\}$/);
  });
});

describe('components use theme tokens only', () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(join(root, d))) {
      const rel = `${d}/${e}`;
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.(astro|ts)$/.test(e)) files.push(rel);
    }
  };
  walk('src/components');
  walk('src/pages');
  // YouTube's play button keeps YouTube red/black on purpose (brand of the embed, not the site).
  const ALLOW = new Set(['src/components/video/LazyYouTube.astro', 'src/components/home/modules/VideoGrid.astro']);
  const PALETTE =
    /\b(?:bg|text|border|from|to|via|ring|fill|stroke|outline|decoration|divide)-(?:white|black|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/;
  test.each(files.filter((f) => !ALLOW.has(f)))('%s', (rel) => {
    const src = read(rel);
    expect(src, 'Tailwind palette colour class — use a token (text-rust, bg-card, chip-good …)').not.toMatch(PALETTE);
    expect(src, 'dark: variant — themes have fixed palettes').not.toMatch(/\bdark:[a-z]/);
    expect(src, 'hsl(var(--x)) — bridge variables hold full colours now').not.toMatch(/hsl\(var\(/);
  });
});

describe('site.ts official game URL (daily patrol contract)', () => {
  test('single-quoted one-liner the patrol regex can parse', () => {
    expect(read('src/config/site.ts')).toMatch(/official:\s*'https:\/\/(www\.roblox\.com\/games\/|store\.steampowered\.com\/app\/)[^']+'/);
  });
});
