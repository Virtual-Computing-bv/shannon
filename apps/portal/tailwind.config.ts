import type { Config } from 'tailwindcss';

// Brand tokens lifted from the Nahayat marketing site (src/index.css). Liquid
// Glass aesthetic: warm onyx background, gold primary, electric violet accent.
// Dark-first — no light theme.
export default {
  darkMode: ['class'],
  content: ['./src/web/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        gold: {
          DEFAULT: 'hsl(36 65% 60%)',
          light: 'hsl(36 75% 70%)',
          dark: 'hsl(36 55% 50%)',
        },
        violet: {
          DEFAULT: 'hsl(268 70% 65%)',
          light: 'hsl(268 75% 75%)',
          dark: 'hsl(268 65% 55%)',
        },
        onyx: {
          DEFAULT: 'hsl(24 7% 7%)',
          light: 'hsl(24 7% 11%)',
        },
        cream: {
          DEFAULT: 'hsl(36 25% 94%)',
          dark: 'hsl(36 20% 86%)',
        },
      },
      fontFamily: {
        display: ['Inter Tight', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        lg: '0.875rem',
        md: '0.625rem',
        sm: '0.4375rem',
      },
      backgroundImage: {
        'aurora':
          'radial-gradient(ellipse at top, hsl(268 75% 65% / 0.18), transparent 60%), radial-gradient(ellipse at bottom right, hsl(36 70% 60% / 0.14), transparent 55%)',
        'gradient-violet':
          'linear-gradient(135deg, hsl(268 75% 65%) 0%, hsl(280 70% 55%) 100%)',
        'gradient-gold':
          'linear-gradient(135deg, hsl(36 80% 70%) 0%, hsl(36 60% 50%) 100%)',
        'gradient-text':
          'linear-gradient(135deg, hsl(40 60% 92%) 0%, hsl(36 70% 70%) 50%, hsl(268 70% 75%) 100%)',
      },
      boxShadow: {
        soft: '0 4px 24px -8px hsl(0 0% 0% / 0.5)',
        card: '0 12px 48px -16px hsl(0 0% 0% / 0.6)',
        glow: '0 0 80px -20px hsl(36 70% 60% / 0.45)',
        violet: '0 0 80px -20px hsl(268 75% 65% / 0.5)',
      },
    },
  },
} satisfies Config;
