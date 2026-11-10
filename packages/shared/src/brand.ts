/**
 * Canonical brand palette, mirrored as CSS variables in
 * `apps/web/src/styles/globals.css`.
 *
 * These constants exist for server-side renderers (DOCX/PDF), which cannot read
 * CSS custom properties. Keep both sources in sync; the design-system test
 * guards the base primary value.
 */
export const brand = {
  primary: {
    50: 'hsl(206, 100%, 96%)',
    100: 'hsl(206, 100%, 90%)',
    200: 'hsl(206, 100%, 80%)',
    300: 'hsl(206, 95%, 66%)',
    400: 'hsl(206, 96%, 52%)',
    500: 'hsl(206, 100%, 42%)',
    600: 'hsl(206, 100%, 32%)',
    700: 'hsl(206, 100%, 25%)',
    800: 'hsl(206, 100%, 19%)',
    900: 'hsl(206, 100%, 14%)',
    950: 'hsl(206, 100%, 9%)',
  },
  success: {
    50: 'hsl(152, 60%, 96%)',
    100: 'hsl(152, 60%, 90%)',
    500: 'hsl(152, 60%, 42%)',
    600: 'hsl(152, 60%, 35%)',
    700: 'hsl(152, 60%, 27%)',
  },
  warning: {
    50: 'hsl(38, 95%, 96%)',
    100: 'hsl(38, 95%, 90%)',
    500: 'hsl(38, 95%, 48%)',
    600: 'hsl(38, 95%, 40%)',
    700: 'hsl(38, 95%, 30%)',
  },
  danger: {
    50: 'hsl(355, 75%, 96%)',
    100: 'hsl(355, 75%, 90%)',
    500: 'hsl(355, 75%, 55%)',
    600: 'hsl(355, 75%, 48%)',
    700: 'hsl(355, 75%, 38%)',
  },
  accent: {
    50: 'hsl(176, 70%, 96%)',
    100: 'hsl(176, 70%, 90%)',
    500: 'hsl(176, 70%, 44%)',
    600: 'hsl(176, 70%, 36%)',
    700: 'hsl(176, 70%, 28%)',
  },
  severity: {
    low: 'hsl(152, 60%, 35%)',
    medium: 'hsl(38, 95%, 48%)',
    high: 'hsl(24, 90%, 50%)',
    critical: 'hsl(355, 75%, 48%)',
  },
  neutral: {
    50: 'hsl(206, 20%, 98%)',
    100: 'hsl(206, 16%, 94%)',
    200: 'hsl(206, 14%, 88%)',
    300: 'hsl(206, 12%, 80%)',
    400: 'hsl(206, 10%, 62%)',
    500: 'hsl(206, 10%, 46%)',
    600: 'hsl(206, 12%, 38%)',
    700: 'hsl(206, 14%, 30%)',
    800: 'hsl(206, 16%, 22%)',
    900: 'hsl(206, 18%, 15%)',
    950: 'hsl(206, 20%, 9%)',
  },
} as const;

export type BrandPalette = typeof brand;

/** Fixed severity colors used identically in UI, DOCX and PDF. */
export const severityColor = {
  LOW: brand.severity.low,
  MEDIUM: brand.severity.medium,
  HIGH: brand.severity.high,
  CRITICAL: brand.severity.critical,
} as const;

/** Progress gradient stops: warning → primary → success. */
export const progressGradient = {
  low: brand.warning[500],
  mid: brand.primary[500],
  high: brand.success[600],
} as const;
