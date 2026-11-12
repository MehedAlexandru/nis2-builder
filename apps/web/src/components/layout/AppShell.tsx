import {
  LayoutDashboard,
  LogOut,
  Menu,
  Scale,
  Building2,
  FileText,
  MonitorSmartphone,
  Network,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { DropdownMenu } from '@/components/layout/DropdownMenu';
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

const navButtonClass = (active: boolean) =>
  cn(
    'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

export function AppShell() {
  const { t } = useTranslation();
  const { status, user, activeOrganization, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const year = new Date().getFullYear();
  const authenticated = status === 'authenticated';
  const complianceActive = ['/dashboard', '/classification', '/documents', '/network'].some(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`),
  );
  const manageActive = ['/organizations', '/sessions'].some(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`),
  );
  const initials = `${user?.givenName?.[0] ?? ''}${user?.familyName?.[0] ?? ''}`.toUpperCase();
  const complianceItems = [
    {
      key: 'dashboard',
      label: t('nav.dashboard'),
      icon: LayoutDashboard,
      to: '/dashboard',
    },
    {
      key: 'classification',
      label: t('nav.classification'),
      icon: ShieldCheck,
      to: '/classification',
    },
    { key: 'documents', label: t('nav.documents'), icon: FileText, to: '/documents' },
    { key: 'network', label: t('nav.network'), icon: Network, to: '/network' },
  ];
  const manageItems = [
    {
      key: 'organizations',
      label: t('nav.organizations'),
      icon: Building2,
      to: '/organizations',
    },
    {
      key: 'sessions',
      label: t('nav.sessions'),
      icon: MonitorSmartphone,
      to: '/sessions',
    },
  ];

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
                <DropdownMenu
                  label={t('nav.compliance')}
                  trigger={t('nav.compliance')}
                  items={complianceItems}
                  triggerClassName={navButtonClass(complianceActive)}
                />
                <DropdownMenu
                  label={t('nav.manage')}
                  trigger={t('nav.manage')}
                  items={manageItems}
                  triggerClassName={navButtonClass(manageActive)}
                />
              </>
            ) : null}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!authenticated ? (
              <>
                <LanguageSwitcher />
                <div className="hidden md:block">
                  <ThemeToggle />
                </div>
              </>
            ) : null}
            {authenticated ? (
              <div className="hidden lg:block">
                <DropdownMenu
                  label={t('nav.account')}
                  align="right"
                  triggerClassName="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1.5 pr-2 text-sm font-medium transition-colors hover:bg-muted"
                  trigger={
                    <>
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-primary-foreground">
                        {initials || 'U'}
                      </span>
                      <span className="hidden max-w-36 truncate xl:inline">
                        {user?.givenName} {user?.familyName}
                      </span>
                    </>
                  }
                  header={
                    <div>
                      <p className="text-sm font-semibold">
                        {user?.givenName} {user?.familyName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {activeOrganization?.name ?? t('auth.noActiveOrganization')}
                      </p>
                    </div>
                  }
                  footer={
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <LanguageSwitcher />
                      <ThemeToggle />
                    </div>
                  }
                  items={[
                    {
                      key: 'logout',
                      label: t('auth.logout'),
                      icon: LogOut,
                      danger: true,
                      onSelect: () => void logout(),
                    },
                  ]}
                />
              </div>
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
                    <NavLink to="/network" className={mobileNavLinkClass}>
                      <Network className="h-4 w-4" aria-hidden="true" />
                      {t('nav.network')}
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
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <LanguageSwitcher />
                      <ThemeToggle />
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
