import { describe, expect, it } from 'vitest';
import { brand, severityColor } from './brand';
import { LEGAL_DISCLAIMER, SUPPORTED_LOCALES } from './constants';

describe('brand tokens', () => {
  it('pins the corporate base primary color', () => {
    expect(brand.primary[600]).toBe('hsl(206, 100%, 32%)');
  });

  it('defines a fixed semantic color for every severity', () => {
    expect(Object.keys(severityColor).sort()).toEqual(['CRITICAL', 'HIGH', 'LOW', 'MEDIUM']);
    expect(new Set(Object.values(severityColor)).size).toBe(4);
  });
});

describe('product constants', () => {
  it('ships both required locales', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(['en', 'ro']);
  });

  it('contains the mandated disclaimer in both languages', () => {
    expect(LEGAL_DISCLAIMER.en).toBe(
      'This tool supports compliance preparation and does not constitute legal advice.',
    );
    expect(LEGAL_DISCLAIMER.ro.length).toBeGreaterThan(20);
  });
});
