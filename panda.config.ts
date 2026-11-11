import { defineConfig } from '@pandacss/dev'
import { accentBar, button, link } from './src/theme/recipes'

/*
 * GoMate design system (mirrors ../go-mate/src/styles.css).
 * Three colours do all the work: brand red, near-black and white. Red is an
 * accent: CTAs, numerals, one red word per headline. Display = Montserrat
 * (uppercase, heavy); body = Inter. Light-only brand.
 */
export default defineConfig({
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  // Off while the hand-written classes in src/styles.css are still in use:
  // Panda's preflight zeroes margins/padding on everything, which those rules
  // don't fully re-establish. Turn on once pages are migrated to Panda.
  preflight: false,
  include: ['./src/**/*.{js,jsx,ts,tsx}'],
  exclude: [],
  jsxFramework: 'react',
  outdir: 'styled-system',

  conditions: {
    extend: {
      // React Aria Components expose interaction state as data attributes.
      // https://react-aria.adobe.com/styling
      hovered: '&[data-hovered]',
      pressed: '&[data-pressed]',
      focused: '&[data-focused]',
      focusVisible: '&[data-focus-visible]',
      disabled: '&[data-disabled]',
      selected: '&[data-selected]',
      invalid: '&[data-invalid]',
      current: '&[data-current]',
      placeholderShown: '&[data-placeholder]',
      open: '&[data-open]',
      entering: '&[data-entering]',
      exiting: '&[data-exiting]',
    },
  },

  globalCss: {
    html: { scrollBehavior: 'smooth' },
    body: {
      fontFamily: 'sans',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
    },
    '::selection': { bg: 'rgba(228, 8, 10, 0.16)' },
    '@media (prefers-reduced-motion: reduce)': {
      html: { scrollBehavior: 'auto' },
      '*, *::before, *::after': {
        animationDuration: '0.01ms !important',
        transitionDuration: '0.01ms !important',
      },
    },
  },

  theme: {
    extend: {
      recipes: { button, link, accentBar },

      tokens: {
        colors: {
          // Brand red (primary accent)
          red: {
            500: { value: '#e4080a' }, // primary brand red
            600: { value: '#c20609' }, // hover
            700: { value: '#9e0507' }, // press / deep
            tint: { value: '#fdecec' },
          },
          // Ink / neutrals
          black: { value: '#0a0a0a' },
          white: { value: '#ffffff' },
          gray: {
            50: { value: '#fafafa' }, // section wash
            100: { value: '#f2f2f2' }, // subtle fill (icon chips)
            200: { value: '#e6e6e6' }, // borders, dividers
            300: { value: '#c9c9c9' },
            400: { value: '#9a9a9a' }, // captions, meta
            500: { value: '#6b6b6b' }, // muted / secondary
            600: { value: '#4b4b4b' }, // strong body
          },
        },
        radii: {
          sm: { value: '8px' },
          md: { value: '12px' },
          lg: { value: '16px' }, // service cards
          xl: { value: '24px' },
        },
        fonts: {
          sans: { value: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif" },
          display: { value: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
        },
        shadows: {
          cta: { value: '0 8px 20px rgba(228, 8, 10, 0.28)' },
        },
      },

      // Same names as go-mate's shadcn-style tokens, so `bg-primary
      // text-primary-foreground` there is
      // `css({ bg: 'primary', color: 'primary.foreground' })` here.
      semanticTokens: {
        colors: {
          background: { value: '{colors.white}' },
          foreground: { value: '{colors.black}' },
          card: { DEFAULT: { value: '{colors.white}' }, foreground: { value: '{colors.black}' } },
          popover: { DEFAULT: { value: '{colors.white}' }, foreground: { value: '{colors.black}' } },
          primary: {
            DEFAULT: { value: '{colors.red.500}' },
            hover: { value: '{colors.red.600}' },
            active: { value: '{colors.red.700}' },
            tint: { value: '{colors.red.tint}' },
            foreground: { value: '{colors.white}' },
          },
          secondary: { DEFAULT: { value: '{colors.gray.100}' }, foreground: { value: '{colors.black}' } },
          muted: { DEFAULT: { value: '{colors.gray.50}' }, foreground: { value: '{colors.gray.500}' } },
          accent: { DEFAULT: { value: '{colors.gray.50}' }, foreground: { value: '{colors.black}' } },
          destructive: { DEFAULT: { value: '{colors.red.500}' }, foreground: { value: '{colors.white}' } },
          border: { value: '{colors.gray.200}' },
          input: { value: '{colors.gray.200}' },
          ring: { value: '{colors.red.500}' },
        },
      },

      textStyles: {
        // go-mate .gm-display: heavy uppercase display headline
        display: {
          value: {
            fontFamily: 'display',
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            lineHeight: '1.05',
          },
        },
        // go-mate .gm-eyebrow: uppercase eyebrow / meta label
        eyebrow: {
          value: {
            fontFamily: 'sans',
            fontWeight: '600',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            color: 'gray.400',
          },
        },
      },
    },
  },
})
