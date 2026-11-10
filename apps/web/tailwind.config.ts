import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const withVar = (name: string) => `hsl(var(--${name}))`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        '2xl': '1280px',
      },
    },
    extend: {
      colors: {
        border: withVar('border'),
        input: withVar('input'),
        ring: withVar('ring'),
        background: withVar('background'),
        foreground: withVar('foreground'),
        card: {
          DEFAULT: withVar('card'),
          foreground: withVar('card-foreground'),
        },
        popover: {
          DEFAULT: withVar('popover'),
          foreground: withVar('popover-foreground'),
        },
        primary: {
          DEFAULT: withVar('primary'),
          foreground: withVar('primary-foreground'),
          50: withVar('primary-50'),
          100: withVar('primary-100'),
          200: withVar('primary-200'),
          300: withVar('primary-300'),
          400: withVar('primary-400'),
          500: withVar('primary-500'),
          600: withVar('primary-600'),
          700: withVar('primary-700'),
          800: withVar('primary-800'),
          900: withVar('primary-900'),
          950: withVar('primary-950'),
        },
        secondary: {
          DEFAULT: withVar('secondary'),
          foreground: withVar('secondary-foreground'),
        },
        muted: {
          DEFAULT: withVar('muted'),
          foreground: withVar('muted-foreground'),
        },
        accent: {
          DEFAULT: withVar('accent'),
          foreground: withVar('accent-foreground'),
          50: withVar('accent-50'),
          100: withVar('accent-100'),
          500: withVar('accent-500'),
          600: withVar('accent-600'),
          700: withVar('accent-700'),
        },
        destructive: {
          DEFAULT: withVar('danger-600'),
          foreground: withVar('danger-foreground'),
        },
        danger: {
          DEFAULT: withVar('danger-600'),
          foreground: withVar('danger-50'),
          50: withVar('danger-50'),
          100: withVar('danger-100'),
          500: withVar('danger-500'),
          600: withVar('danger-600'),
          700: withVar('danger-700'),
        },
        success: {
          DEFAULT: withVar('success-600'),
          50: withVar('success-50'),
          100: withVar('success-100'),
          500: withVar('success-500'),
          600: withVar('success-600'),
          700: withVar('success-700'),
        },
        warning: {
          DEFAULT: withVar('warning-500'),
          50: withVar('warning-50'),
          100: withVar('warning-100'),
          500: withVar('warning-500'),
          600: withVar('warning-600'),
          700: withVar('warning-700'),
        },
        severity: {
          low: withVar('severity-low'),
          medium: withVar('severity-medium'),
          high: withVar('severity-high'),
          critical: withVar('severity-critical'),
        },
        neutral: {
          50: withVar('neutral-50'),
          100: withVar('neutral-100'),
          200: withVar('neutral-200'),
          300: withVar('neutral-300'),
          400: withVar('neutral-400'),
          500: withVar('neutral-500'),
          600: withVar('neutral-600'),
          700: withVar('neutral-700'),
          800: withVar('neutral-800'),
          900: withVar('neutral-900'),
          950: withVar('neutral-950'),
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      backgroundImage: {
        'progress-gradient':
          'linear-gradient(90deg, hsl(var(--warning-500)) 0%, hsl(var(--primary-500)) 50%, hsl(var(--success-600)) 100%)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
