import { LayoutDashboard, LogOut, Scale, Building2, MonitorSmartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/cn';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

export function AppShell() {
  const { t } = useTranslation();
  const { status, user, activeOrganization, logout } = useAuth();
  const year = new Date().getFullYear();
  const authenticated = status === 'authenticated';

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        {t('common.skipToContent')}
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container flex min-h-16 flex-wrap items-center justify-between gap-3 py-2">
          <div className="flex items-center gap-6">
            <Logo />
            <nav aria-label={t('nav.primaryLabel')} className="hidden items-center gap-1 md:flex">
              <NavLink to="/" end className={navLinkClass}>
                {t('nav.home')}
              </NavLink>
              {authenticated ? (
                <>
                  <NavLink to="/dashboard" className={navLinkClass}>
                    <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                    {t('nav.dashboard')}
                  </NavLink>
                  <NavLink to="/organizations" className={navLinkClass}>
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                    {t('nav.organizations')}
                  </NavLink>
                  <NavLink to="/sessions" className={navLinkClass}>
                    <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />
                    {t('nav.sessions')}
                  </NavLink>
                </>
              ) : null}
              <NavLink to="/design" className={navLinkClass}>
                {t('nav.design')}
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            {authenticated ? (
              <>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium leading-tight">
                    {user?.givenName} {user?.familyName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activeOrganization?.name ?? t('auth.noActiveOrganization')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void logout()}
                  aria-label={t('auth.logout')}
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span className="ml-1.5 hidden sm:inline">{t('auth.logout')}</span>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">{t('nav.signIn')}</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">{t('nav.register')}</Link>
                </Button>
              </>
            )}
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
