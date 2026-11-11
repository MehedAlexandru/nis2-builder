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

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('auth.reset.mismatch'));
      return;
    }
    setPending(true);
    try {
      await authApi.resetPassword(token, password);
      navigate('/login', { replace: true, state: { reset: true } });
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
      title={t('auth.reset.title')}
      description={t('auth.reset.description')}
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
          {t('auth.reset.invalidLink')}
        </Alert>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="danger" role="alert">
              {error}
            </Alert>
          ) : null}
          <Field
            id="new-password"
            label={t('auth.fields.newPassword')}
            hint={t('auth.fields.passwordHint')}
          >
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field id="confirm-password" label={t('auth.fields.confirmPassword')}>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {t('auth.reset.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
