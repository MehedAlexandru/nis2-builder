import type { SupportedLocale } from '@nis2/shared';

const intlLocale: Record<SupportedLocale, string> = {
  en: 'en-GB',
  ro: 'ro-RO',
};

const toIntlLocale = (locale: string): string =>
  intlLocale[locale as SupportedLocale] ?? intlLocale.en;

export function formatDate(value: Date | string | number, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatDateTime(value: Date | string | number, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(toIntlLocale(locale)).format(value);
}

export function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function formatCurrency(value: number, locale: string, currency = 'EUR'): string {
  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
