import { FileText, Network, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { useAuth } from '@/features/auth/auth-context';

const modules = [
  {
    key: 'classification',
    icon: ShieldCheck,
    phase: 'auth.dashboard.phases.classification',
    to: '/classification',
  },
  { key: 'documents', icon: FileText, phase: 'auth.dashboard.phases.documents', to: '/documents' },
  { key: 'audit', icon: Network, phase: 'auth.dashboard.phases.audit', to: null },
] as const;

export function DashboardPage() {
  const { t } = useTranslation();
  const { user, activeOrganization, organizations } = useAuth();

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {t('auth.dashboard.welcome', { name: user?.givenName ?? '' })}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{t('auth.dashboard.title')}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t('auth.dashboard.subtitle')}</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/organizations">{t('auth.dashboard.manageOrganizations')}</Link>
        </Button>
      </div>

      {activeOrganization ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle>{activeOrganization.name}</CardTitle>
              <CardDescription>
                {activeOrganization.countryCode} · {activeOrganization.jurisdictionPackCode} ·{' '}
                {t(activeOrganization.role === 'OWNER' ? 'auth.roles.owner' : 'auth.roles.member')}
              </CardDescription>
            </div>
            <Badge variant={activeOrganization.scopeMode === 'MANDATORY' ? 'primary' : 'neutral'}>
              {t(
                activeOrganization.scopeMode === 'MANDATORY'
                  ? 'auth.scopeMode.mandatory'
                  : 'auth.scopeMode.voluntary',
              )}
            </Badge>
          </CardHeader>
          <CardContent>
            <Progress value={0} label={t('auth.dashboard.overallProgress')} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('auth.dashboard.selectOrganizationTitle')}</CardTitle>
            <CardDescription>
              {organizations.length > 0
                ? t('auth.dashboard.selectOrganizationBody')
                : t('auth.dashboard.noOrganizationBody')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/organizations">{t('auth.dashboard.manageOrganizations')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="modules-title" className="space-y-4">
        <h2 id="modules-title" className="text-xl font-semibold tracking-tight">
          {t('auth.dashboard.modulesTitle')}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {modules.map(({ key, icon: Icon, phase, to }) => (
            <Card key={key} className="h-full">
              <CardHeader>
                <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <CardTitle>{t(`auth.dashboard.modules.${key}.title`)}</CardTitle>
                <CardDescription className="leading-relaxed">
                  {t(`auth.dashboard.modules.${key}.description`)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {to ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to={to}>{t('actions.open')}</Link>
                  </Button>
                ) : (
                  <Badge variant="neutral">{t(phase)}</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="next-actions-title" className="space-y-4">
        <h2 id="next-actions-title" className="text-xl font-semibold tracking-tight">
          {t('auth.dashboard.nextActionsTitle')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {(['profile', 'security', 'organization', 'invite'] as const).map((action) => (
            <li
              key={action}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
            >
              <TriangleAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-warning-600"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium">{t(`auth.dashboard.actions.${action}.title`)}</p>
                <p className="text-sm text-muted-foreground">
                  {t(`auth.dashboard.actions.${action}.description`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
