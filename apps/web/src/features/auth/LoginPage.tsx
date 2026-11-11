import { Link, useNavigate } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ApiClientError } from '@/lib/api';
import { authErrorText } from './auth-errors';
import { useAuth } from './auth-context';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setPending(true);
    try {
      const response = await login({ email, password });
      if ('accessToken' in response) {
        navigate('/dashboard', { replace: true });
      } else if ('mfaRequired' in response) {
        navigate('/mfa', { state: { token: response.challengeToken } });
      } else {
        navigate('/mfa-setup', { state: { token: response.setupToken } });
      }
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        if (caught.code === 'EMAIL_NOT_VERIFIED') setNeedsVerification(true);
        setError(authErrorText(t, caught.code, caught.message));
      } else {
        setError(t('auth.errors.generic'));
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title={t('auth.login.title')}
      description={t('auth.login.description')}
      footer={
        <>
          {t('auth.login.noAccount')}{' '}
          <Link
            className="font-medium text-primary-700 hover:underline dark:text-primary-300"
            to="/register"
          >
            {t('auth.login.createAccount')}
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {error ? (
          <Alert variant="danger" role="alert">
            {error}
            {needsVerification ? (
              <>
                {' '}
                <Link className="font-medium underline" to="/verify-email">
                  {t('auth.login.resendVerification')}
                </Link>
              </>
            ) : null}
          </Alert>
        ) : null}
        <Field id="email" label={t('auth.fields.email')}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field id="password" label={t('auth.fields.password')}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <div className="flex items-center justify-between">
          <Link
            className="text-sm text-primary-700 hover:underline dark:text-primary-300"
            to="/forgot-password"
          >
            {t('auth.login.forgotPassword')}
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t('auth.login.submitting') : t('auth.login.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
