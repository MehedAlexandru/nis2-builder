import { Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

export function AppShell() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        {t('common.skipToContent')}
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container flex min-h-16 flex-wrap items-center justify-between gap-3 py-2">
          <div className="flex items-center gap-6">
            <Logo />
            <nav aria-label={t('nav.primaryLabel')} className="hidden items-center gap-1 sm:flex">
              <NavLink to="/" end className={navLinkClass}>
                {t('nav.home')}
              </NavLink>
              <NavLink to="/design" className={navLinkClass}>
                {t('nav.design')}
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button variant="outline" size="sm" disabled title={t('actions.comingSoon')}>
              {t('nav.signIn')}
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-card">
        <div className="container flex flex-col gap-4 py-8 text-sm text-muted-foreground md:flex-row md:items-start md:justify-between">
          <div className="flex max-w-2xl items-start gap-3">
            <Scale
              className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-300"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-medium text-foreground">{t('footer.disclaimer')}</p>
              <p>{t('footer.legalReview')}</p>
            </div>
          </div>
          <p className="shrink-0">
            © {year} {t('footer.rights')}
          </p>
        </div>
      </footer>
    </div>
  );
}
