/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

/** CSS variable → Tailwind color that still supports `/<alpha>` modifiers. */
const tok = (v) => `color-mix(in srgb, var(${v}) calc(<alpha-value> * 100%), transparent)`;

/** @tailwindcss/typography color variables mapped to theme tokens. */
const proseVars = (p) => ({
  [`--tw-prose-${p}body`]: 'var(--color-ink-soft)',
  [`--tw-prose-${p}headings`]: 'var(--color-ink)',
  [`--tw-prose-${p}lead`]: 'var(--color-ink-soft)',
  [`--tw-prose-${p}links`]: 'var(--color-ink)',
  [`--tw-prose-${p}bold`]: 'var(--color-ink)',
  [`--tw-prose-${p}counters`]: 'var(--color-ink-faint)',
  [`--tw-prose-${p}bullets`]: 'var(--color-rust)',
  [`--tw-prose-${p}hr`]: 'var(--color-rule)',
  [`--tw-prose-${p}quotes`]: 'var(--color-ink)',
  [`--tw-prose-${p}quote-borders`]: 'var(--color-rust)',
  [`--tw-prose-${p}captions`]: 'var(--color-ink-faint)',
  [`--tw-prose-${p}kbd`]: 'var(--color-ink)',
  [`--tw-prose-${p}code`]: 'var(--color-ink)',
  [`--tw-prose-${p}pre-code`]: 'var(--color-ink)',
  [`--tw-prose-${p}pre-bg`]: 'var(--color-paper-edge)',
  [`--tw-prose-${p}th-borders`]: 'var(--color-rule-hard)',
  [`--tw-prose-${p}td-borders`]: 'var(--color-rule)',
});

export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Design tokens — every color resolves to a CSS variable: the bridge
        // variables in src/styles/globals.css (AnvilWiki names) or the theme
        // tokens from src/styles/theme/theme.css (Ship/game-themes names).
        // Re-theming = swapping theme.css; never hard-code colors in components.
        // tok() wraps the variable in color-mix so opacity modifiers keep
        // working (`bg-primary/10`, `hover:border-nav/50`).
        border: tok('--border'),
        input: tok('--border'),
        ring: tok('--brand'),
        background: tok('--background'),
        foreground: tok('--foreground'),
        nav: {
          // DEFAULT is the text-safe accent (WCAG AA on every theme);
          // nav-light is decorative (blocks, glows).
          DEFAULT: tok('--brand-text'),
          light: tok('--brand-light'),
        },
        primary: {
          DEFAULT: tok('--brand'),
          foreground: tok('--on-brand'),
        },
        secondary: {
          DEFAULT: tok('--muted'),
          foreground: tok('--foreground'),
        },
        destructive: {
          DEFAULT: tok('--color-rust'),
          foreground: tok('--on-brand'),
        },
        muted: {
          DEFAULT: tok('--muted'),
          foreground: tok('--muted-foreground'),
        },
        accent: {
          DEFAULT: tok('--muted'),
          foreground: tok('--foreground'),
        },
        popover: {
          DEFAULT: tok('--card'),
          foreground: tok('--foreground'),
        },
        card: {
          DEFAULT: tok('--card'),
          foreground: tok('--card-foreground'),
        },
        // Ship/game-themes token names (same utilities as the Tailwind v4 sites:
        // text-rust, bg-paper, border-rule …). rust = primary accent,
        // ochre = data/status highlight, moss = positive/done.
        paper: { DEFAULT: tok('--color-paper'), edge: tok('--color-paper-edge') },
        ink: { DEFAULT: tok('--color-ink'), soft: tok('--color-ink-soft'), faint: tok('--color-ink-faint') },
        rule: { DEFAULT: tok('--color-rule'), hard: tok('--color-rule-hard') },
        rust: tok('--color-rust'),
        'ember-lite': tok('--color-ember-lite'),
        ochre: tok('--color-ochre'),
        moss: tok('--color-moss'),
      },
      borderRadius: {
        lg: 'var(--radius, 0.5rem)',
        md: 'calc(var(--radius, 0.5rem) - 2px)',
        sm: 'calc(var(--radius, 0.5rem) - 4px)',
      },
      // Theme fonts (self-hosted @fontsource, imported by theme.css).
      // --font-serif is the DISPLAY face (not necessarily a serif).
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'ui-sans-serif', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        code: ['var(--font-code)', 'ui-monospace', 'monospace'],
      },
      // Article body colors come from the theme (both normal and inverted
      // sets, so a stray `prose-invert` cannot break contrast).
      typography: () => ({
        DEFAULT: {
          css: {
            ...proseVars(''),
            ...proseVars('invert-'),
            // Underline + accent colour are set in globals.css (.prose a).
            a: { fontWeight: '600' },
          },
        },
      }),
    },
  },
  plugins: [typography],
};
