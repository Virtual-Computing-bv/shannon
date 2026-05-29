import type { Config } from 'tailwindcss';

// Nahayat "Helder" design system — light, clean, accessible. Ink-navy from the
// logo (#0B1320) + electric blue accent (#2F6BEF) + cyan support (#0CA5C9).
// Plus Jakarta Sans for UI, IBM Plex Mono for code/tags. Mirrors ds/tokens.css
// from the Nahayat design handoff. Light-first — no dark theme.
export default {
  content: ['./src/web/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0B1320',
          800: '#141D2E',
          700: '#1F2A3D',
          600: '#36425A',
          500: '#5A6473',
          400: '#8A93A3',
          300: '#A8B0BD',
          200: '#C9D0DA',
        },
        blue: {
          700: '#1E50C4',
          600: '#2F6BEF',
          500: '#5689F4',
          200: '#BFD4FC',
          100: '#EAF1FE',
          50: '#F4F8FF',
        },
        cyan: {
          600: '#0CA5C9',
          100: '#E2F6FB',
        },
        bg: '#FBFCFD',
        surface: '#FFFFFF',
        panel: '#F4F6F9',
        line: {
          DEFAULT: '#E7EBF1',
          strong: '#D7DDE6',
        },
        success: { 600: '#18935F', 100: '#E6F6EF' },
        warning: { 600: '#C9810C', 100: '#FBF1DE' },
        danger: { 600: '#D6453A', 100: '#FBEBE9' },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        pill: '100px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(11,19,32,.05)',
        sm: '0 1px 2px rgba(11,19,32,.04), 0 4px 12px -6px rgba(11,19,32,.10)',
        md: '0 1px 2px rgba(11,19,32,.04), 0 8px 24px -12px rgba(11,19,32,.13)',
        lg: '0 2px 4px rgba(11,19,32,.04), 0 24px 48px -20px rgba(11,19,32,.22)',
        ring: '0 0 0 3px rgba(47,107,239,.32)',
      },
      transitionTimingFunction: {
        nahayat: 'cubic-bezier(.22,.61,.36,1)',
      },
    },
  },
} satisfies Config;
