import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ApiClientError, authApi } from '@/lib/api';
import { authErrorText } from './auth-errors';
import { AuthLayout } from './AuthLayout';

export function AcceptInvitePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [form, setForm] = useState({ givenName: '', familyName: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await authApi.acceptInvite({ token, ...form, locale: 'en' });
      navigate('/login', { replace: true, state: { invited: true } });
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
      title={t('auth.invite.title')}
      description={t('auth.invite.description')}
      footer={
        <Link
          className="font-medium text-primary-700 hover:underline dark:text-primary-300"
          to="/login"
        >
          {t('auth.login.submit')}
        </Link>
      }
    >
      {!token ? (
        <Alert variant="danger" role="alert">
          {t('auth.invite.invalidLink')}
        </Alert>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="danger" role="alert">
              {error}
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="invite-given" label={t('auth.fields.givenName')}>
              <Input
                id="invite-given"
                required
                value={form.givenName}
                onChange={update('givenName')}
              />
            </Field>
            <Field id="invite-family" label={t('auth.fields.familyName')}>
              <Input
                id="invite-family"
                required
                value={form.familyName}
                onChange={update('familyName')}
              />
            </Field>
          </div>
          <Field
            id="invite-password"
            label={t('auth.fields.password')}
            hint={t('auth.fields.passwordHint')}
          >
            <Input
              id="invite-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={form.password}
              onChange={update('password')}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {t('auth.invite.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
