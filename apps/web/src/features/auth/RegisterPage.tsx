import { Link } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ApiClientError, authApi } from '@/lib/api';
import { authErrorText } from './auth-errors';
import { AuthLayout } from './AuthLayout';

export function RegisterPage() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    givenName: '',
    familyName: '',
    email: '',
    password: '',
    organizationName: '',
    countryCode: 'RO',
  });

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await authApi.register({ ...form, locale: 'en' });
      setSent(true);
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
    <AuthLayout
      title={t('auth.register.title')}
      description={t('auth.register.description')}
      footer={
        <>
          {t('auth.register.haveAccount')}{' '}
          <Link
            className="font-medium text-primary-700 hover:underline dark:text-primary-300"
            to="/login"
          >
            {t('auth.login.submit')}
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <Alert variant="success" role="status" title={t('auth.register.checkEmailTitle')}>
            {t('auth.register.checkEmailBody', { email: form.email })}
          </Alert>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">{t('auth.register.backToLogin')}</Link>
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {error ? (
            <Alert variant="danger" role="alert">
              {error}
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="givenName" label={t('auth.fields.givenName')}>
              <Input
                id="givenName"
                required
                value={form.givenName}
                onChange={update('givenName')}
              />
            </Field>
            <Field id="familyName" label={t('auth.fields.familyName')}>
              <Input
                id="familyName"
                required
                value={form.familyName}
                onChange={update('familyName')}
              />
            </Field>
          </div>
          <Field id="email" label={t('auth.fields.email')}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={update('email')}
            />
          </Field>
          <Field
            id="password"
            label={t('auth.fields.password')}
            hint={t('auth.fields.passwordHint')}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={form.password}
              onChange={update('password')}
            />
          </Field>
          <Field id="organizationName" label={t('auth.fields.organizationName')}>
            <Input
              id="organizationName"
              required
              value={form.organizationName}
              onChange={update('organizationName')}
            />
          </Field>
          <Field id="countryCode" label={t('auth.fields.country')}>
            <select
              id="countryCode"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.countryCode}
              onChange={update('countryCode')}
            >
              <option value="RO">Romania</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
              <option value="NL">Netherlands</option>
              <option value="ES">Spain</option>
              <option value="IT">Italy</option>
            </select>
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? t('auth.register.submitting') : t('auth.register.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
