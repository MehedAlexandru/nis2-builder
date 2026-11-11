import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AuthResponse } from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ApiClientError, authApi } from '@/lib/api';
import { authErrorText } from './auth-errors';
import { useAuth } from './auth-context';
import { AuthLayout } from './AuthLayout';

export function MfaChallengePage() {
  const { t } = useTranslation();
  const { completeLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const token = (location.state as { token?: string } | null)?.token;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError(null);
    try {
      const response = await authApi.mfaChallenge(token, code);
      completeLogin(response as AuthResponse);
      navigate('/dashboard', { replace: true });
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
      title={t('auth.mfa.challengeTitle')}
      description={t('auth.mfa.challengeDescription')}
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
          {t('auth.mfa.missingChallenge')}
        </Alert>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <Alert variant="danger" role="alert">
              {error}
            </Alert>
          ) : null}
          <Field id="mfa-code" label={t('auth.mfa.codeLabel')} hint={t('auth.mfa.codeHint')}>
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {t('auth.mfa.verify')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
