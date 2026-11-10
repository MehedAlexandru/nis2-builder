import { SUPPORTED_LOCALES } from '@nis2/shared';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

const languageNames: Record<string, string> = {
  en: 'English',
  ro: 'Română',
};

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const active = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div
      className="inline-flex items-center rounded-lg border border-border bg-card p-0.5"
      role="group"
      aria-label={t('common.language')}
    >
      {SUPPORTED_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => void i18n.changeLanguage(locale)}
          aria-pressed={active.startsWith(locale)}
          className={cn(
            'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
            active.startsWith(locale)
              ? 'bg-primary-600 text-white dark:bg-primary-500 dark:text-primary-950'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <span aria-hidden="true">{locale.toUpperCase()}</span>
          <span className="sr-only">{languageNames[locale]}</span>
        </button>
      ))}
    </div>
  );
}
