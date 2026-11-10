import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, formatNumber, formatPercent } from './format';

describe('locale formatting', () => {
  const date = new Date('2026-11-10T12:00:00Z');

  it('formats dates with the requested locale', () => {
    expect(formatDate(date, 'en')).toMatch(/2026/);
    expect(formatDate(date, 'ro')).toMatch(/2026/);
    expect(formatDate('not-a-date', 'en')).toBe('—');
  });

  it('formats numbers and percentages', () => {
    expect(formatNumber(1234567.89, 'en')).toMatch(/1[.,]234[.,]567/);
    expect(formatPercent(72, 'ro')).toMatch(/72/);
  });

  it('formats EUR amounts', () => {
    expect(formatCurrency(125000, 'en')).toMatch(/€|EUR/);
  });
});
