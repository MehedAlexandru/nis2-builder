import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '@/app/theme-context';
import { cn } from '@/lib/cn';

const options: Array<{
  value: Theme;
  labelKey: 'common.light' | 'common.dark' | 'common.system';
  Icon: typeof Sun;
}> = [
  { value: 'light', labelKey: 'common.light', Icon: Sun },
  { value: 'dark', labelKey: 'common.dark', Icon: Moon },
  { value: 'system', labelKey: 'common.system', Icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <div
      className="inline-flex items-center rounded-lg border border-border bg-card p-0.5"
      role="group"
      aria-label={t('common.theme')}
    >
      {options.map(({ value, labelKey, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-pressed={theme === value}
          title={t(labelKey)}
          className={cn(
            'rounded-md p-1.5 transition-colors',
            theme === value
              ? 'bg-primary-600 text-white dark:bg-primary-500 dark:text-primary-950'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{t(labelKey)}</span>
        </button>
      ))}
    </div>
  );
}
