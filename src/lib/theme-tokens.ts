/**
 * Pure helpers for reading a game-themes token file (no Vite/Astro imports, so
 * Node scripts and tests can use them too).
 */

/** `--color-paper: #0b0c0b;` → { 'color-paper': '#0b0c0b' } (first @theme block wins). */
export function parseThemeTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const block = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? css;
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const key = m[1];
    if (!(key in out)) out[key] = m[2].replace(/\/\*[\s\S]*?\*\//g, '').trim();
  }
  return out;
}

/** Header comment `game-themes / candy —— …` → 'candy'. */
export function themeIdFromCss(css: string): string {
  return css.match(/game-themes\s*\/\s*([a-z0-9-]+)/i)?.[1] ?? 'unknown';
}

/** WCAG relative luminance of a #rgb / #rrggbb colour (null if not hex). */
export function hexLuminance(hex: string): number | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Dark page background → 'dark'. Non-hex values default to 'light'. */
export function schemeForPaper(paper: string): 'light' | 'dark' {
  const l = hexLuminance(paper);
  return l !== null && l < 0.18 ? 'dark' : 'light';
}
