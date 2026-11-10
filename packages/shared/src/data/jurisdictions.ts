/**
 * Jurisdiction pack metadata. Jurisdiction packs are data, not code: adding a
 * member state must never require application changes.
 *
 * IMPORTANT: legal content is versioned and carries a review status. The
 * Romanian pack ships as `pending-legal-review` until a qualified reviewer
 * validates every citation against OUG 155/2024 and the DNSC guidance.
 */
export interface JurisdictionPackMetadata {
  code: string;
  name: string;
  authority: string;
  authorityUrl: string;
  legalInstrument: string;
  status: 'draft' | 'pending-legal-review' | 'verified';
  version: string;
}

export const jurisdictionPacks = {
  RO: {
    code: 'RO',
    name: 'Romania',
    authority: 'DNSC',
    authorityUrl: 'https://www.dnsc.ro',
    legalInstrument: 'OUG 155/2024',
    status: 'pending-legal-review',
    version: '0.1.0-draft',
  },
} as const satisfies Record<string, JurisdictionPackMetadata>;

export type JurisdictionCode = keyof typeof jurisdictionPacks;

export const EU_MEMBER_STATES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
] as const;

export type EuMemberState = (typeof EU_MEMBER_STATES)[number];
