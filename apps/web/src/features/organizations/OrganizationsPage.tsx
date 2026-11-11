import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { ApiClientError, organizationsApi } from '@/lib/api';
import { authErrorText } from '@/features/auth/auth-errors';
import { useAuth } from '@/features/auth/auth-context';

export function OrganizationsPage() {
  const { t } = useTranslation();
  const { organizations, activeOrganizationId, selectOrganization, refresh } = useAuth();
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('RO');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await organizationsApi.create({ name, countryCode });
      await refresh();
      await selectOrganization(created.id);
      setName('');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? authErrorText(t, caught.code, caught.message)
          : t('auth.errors.generic'),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="container space-y-8 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('auth.organizations.title')}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('auth.organizations.subtitle')}</p>
      </div>

      <section className="space-y-4" aria-labelledby="your-organizations">
        <h2 id="your-organizations" className="text-xl font-semibold tracking-tight">
          {t('auth.organizations.yourOrganizations')}
        </h2>
        {organizations.length === 0 ? (
          <Alert variant="info">{t('auth.organizations.empty')}</Alert>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {organizations.map((organization) => {
              const active = organization.id === activeOrganizationId;
              return (
                <li key={organization.id}>
                  <Card>
                    <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                      <div>
                        <CardTitle>{organization.name}</CardTitle>
                        <CardDescription>
                          {organization.countryCode} ·{' '}
                          {t(
                            organization.role === 'OWNER'
                              ? 'auth.roles.owner'
                              : 'auth.roles.member',
                          )}{' '}
                          · {organization.plan}
                        </CardDescription>
                      </div>
                      {active ? (
                        <Badge variant="success">{t('auth.organizations.active')}</Badge>
                      ) : null}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant={organization.status === 'ACTIVE' ? 'primary' : 'danger'}>
                          {t(
                            organization.status === 'ACTIVE'
                              ? 'auth.organizations.status.active'
                              : 'auth.organizations.status.suspended',
                          )}
                        </Badge>
                        <Button
                          variant={active ? 'outline' : 'primary'}
                          size="sm"
                          disabled={active}
                          onClick={() => void selectOrganization(organization.id)}
                        >
                          {active
                            ? t('auth.organizations.current')
                            : t('auth.organizations.select')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="create-organization" className="max-w-xl space-y-4">
        <h2 id="create-organization" className="text-xl font-semibold tracking-tight">
          {t('auth.organizations.createTitle')}
        </h2>
        {error ? (
          <Alert variant="danger" role="alert">
            {error}
          </Alert>
        ) : null}
        <Card>
          <CardContent className="p-6">
            <form className="space-y-4" onSubmit={create}>
              <Field id="org-name" label={t('auth.fields.organizationName')}>
                <Input
                  id="org-name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field id="org-country" label={t('auth.fields.country')}>
                <select
                  id="org-country"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={countryCode}
                  onChange={(event) => setCountryCode(event.target.value)}
                >
                  <option value="RO">Romania</option>
                  <option value="DE">Germany</option>
                  <option value="FR">France</option>
                  <option value="NL">Netherlands</option>
                  <option value="ES">Spain</option>
                  <option value="IT">Italy</option>
                </select>
              </Field>
              <Button type="submit" disabled={pending}>
                {t('auth.organizations.createSubmit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
