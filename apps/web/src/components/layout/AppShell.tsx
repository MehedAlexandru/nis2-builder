import {
  LayoutDashboard,
  LogOut,
  Menu,
  Scale,
  Building2,
  FileText,
  MonitorSmartphone,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/cn';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(navLinkClass({ isActive }), 'w-full justify-start px-3 py-2.5');

export function AppShell() {
  const { t } = useTranslation();
  const { status, user, activeOrganization, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const year = new Date().getFullYear();
  const authenticated = status === 'authenticated';

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        {t('common.skipToContent')}
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container flex flex-wrap items-center gap-x-4 gap-y-2 py-2 lg:flex-nowrap">
          <div className="flex shrink-0 items-center">
            <Logo />
          </div>

          <nav
            aria-label={t('nav.primaryLabel')}
            className="hidden min-w-0 items-center gap-0.5 lg:flex lg:flex-1"
          >
            <NavLink to="/" end className={navLinkClass}>
              {t('nav.home')}
            </NavLink>
            {authenticated ? (
              <>
                <NavLink to="/dashboard" className={navLinkClass}>
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  {t('nav.dashboard')}
                </NavLink>
                <NavLink to="/classification" className={navLinkClass}>
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  {t('nav.classification')}
                </NavLink>
                <NavLink to="/documents" className={navLinkClass}>
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {t('nav.documents')}
                </NavLink>
                <NavLink to="/organizations" className={navLinkClass}>
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  {t('nav.organizations')}
                </NavLink>
                <NavLink
                  to="/sessions"
                  className={({ isActive }) =>
                    cn(navLinkClass({ isActive }), 'hidden xl:inline-flex')
                  }
                >
                  <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />
                  {t('nav.sessions')}
                </NavLink>
              </>
            ) : null}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
            {authenticated ? (
              <>
                <div className="hidden text-right xl:block">
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
                  className="hidden lg:inline-flex"
                  onClick={() => void logout()}
                  aria-label={t('auth.logout')}
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span className="ml-1.5 hidden xl:inline">{t('auth.logout')}</span>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link to="/login">{t('nav.signIn')}</Link>
                </Button>
                <Button asChild size="sm" className="hidden sm:inline-flex">
                  <Link to="/register">{t('nav.register')}</Link>
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Menu className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>

          {mobileMenuOpen ? (
            <div id="mobile-menu" className="w-full lg:hidden">
              <nav
                aria-label={t('nav.mobileLabel')}
                className="grid gap-1 border-t border-border pt-3"
              >
                <NavLink to="/" end className={mobileNavLinkClass}>
                  {t('nav.home')}
                </NavLink>
                {authenticated ? (
                  <>
                    <NavLink to="/dashboard" className={mobileNavLinkClass}>
                      <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                      {t('nav.dashboard')}
                    </NavLink>
                    <NavLink to="/classification" className={mobileNavLinkClass}>
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      {t('nav.classification')}
                    </NavLink>
                    <NavLink to="/documents" className={mobileNavLinkClass}>
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      {t('nav.documents')}
                    </NavLink>
                    <NavLink to="/organizations" className={mobileNavLinkClass}>
                      <Building2 className="h-4 w-4" aria-hidden="true" />
                      {t('nav.organizations')}
                    </NavLink>
                    <NavLink to="/sessions" className={mobileNavLinkClass}>
                      <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />
                      {t('nav.sessions')}
                    </NavLink>
                  </>
                ) : null}
              </nav>

              <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 pb-1">
                {authenticated ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {user?.givenName} {user?.familyName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {activeOrganization?.name ?? t('auth.noActiveOrganization')}
                        </p>
                      </div>
                      <div className="md:hidden">
                        <ThemeToggle />
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        void logout();
                      }}
                    >
                      <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('auth.logout')}
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="md:hidden">
                      <ThemeToggle />
                    </div>
                    <div className="flex flex-col gap-2 sm:hidden">
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <Link to="/login">{t('nav.signIn')}</Link>
                      </Button>
                      <Button asChild size="sm" className="w-full">
                        <Link to="/register">{t('nav.register')}</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
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
