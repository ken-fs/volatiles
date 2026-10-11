/**
 * PostCSS config — merged by @astrojs/tailwind (user plugins run first, then
 * Tailwind + autoprefixer).
 *
 * Why the plugin below exists: the shared theme library (Ship/game-themes) is
 * written for Tailwind v4, where design tokens live in `@theme { … }` blocks.
 * This template runs Tailwind v3 (AnvilWiki upstream), which does not know
 * `@theme` and would ship the at-rule untouched — the browser ignores unknown
 * at-rules, so every --color-* token would be undefined and the whole theme
 * would silently disappear. Converting `@theme { … }` → `:root { … }` keeps
 * src/styles/theme/{base,theme}.css byte-identical copies of the library files
 * (scripts/sync-theme.mjs overwrites them), so there is nothing to hand-port.
 */
const gameThemeAtRule = () => ({
  postcssPlugin: 'game-themes-at-theme',
  AtRule: {
    theme(atRule, { Rule }) {
      const rule = new Rule({ selector: ':root', source: atRule.source });
      rule.append(atRule.nodes ?? []);
      atRule.replaceWith(rule);
    },
  },
});
gameThemeAtRule.postcss = true;

export default {
  plugins: [gameThemeAtRule()],
};
