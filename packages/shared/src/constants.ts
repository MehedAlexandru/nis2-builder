export const APP_NAME = 'NIS2 Compass';

export const SUPPORTED_LOCALES = ['en', 'ro'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';
export const DEFAULT_JURISDICTION = 'RO';

/**
 * Mandatory visible disclaimer. The English wording is fixed by the product
 * specification; the Romanian text is the reviewed translation.
 */
export const LEGAL_DISCLAIMER = {
  en: 'This tool supports compliance preparation and does not constitute legal advice.',
  ro: 'Acest instrument sprijină pregătirea conformității și nu constituie consultanță juridică.',
} as const;

export const LIMITS = {
  passwordMinLength: 12,
  passwordMaxLength: 128,
  emailMaxLength: 254,
  pageSizeDefault: 25,
  pageSizeMax: 100,
} as const;

/** NIS2 incident reporting deadlines, from Art. 23(4). */
export const INCIDENT_DEADLINES = {
  earlyWarningHours: 24,
  notificationHours: 72,
  finalReportDays: 30,
} as const;
