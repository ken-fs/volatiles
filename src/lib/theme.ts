/**
 * Build-time facts about the installed game theme (src/styles/theme/theme.css,
 * a copy of Ship/game-themes/tokens/<id>.css).
 *
 * Every theme has a FIXED palette (no light/dark toggle): the theme decides.
 * BaseLayout reads `themeScheme` to set `color-scheme`, the `.dark` class
 * (so giscus / `dark:` variants follow a dark theme) and <meta theme-color>.
 * Swapping theme.css and rebuilding updates all of it — nothing to hand-edit.
 */
import themeCss from '~/styles/theme/theme.css?raw';
import { parseThemeTokens, themeIdFromCss, schemeForPaper } from './theme-tokens';

export const themeTokens = parseThemeTokens(themeCss);
export const themeId = themeIdFromCss(themeCss);
/** Page background (hex) — used for <meta name="theme-color">. */
export const themePaper = themeTokens['color-paper'] ?? '#ffffff';
export const themeScheme: 'light' | 'dark' = schemeForPaper(themePaper);
