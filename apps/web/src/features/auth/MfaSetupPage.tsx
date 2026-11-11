import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AuthResponse, MfaSetupResponse } from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ApiClientError, authApi } from '@/lib/api';
import { authErrorText } from './auth-errors';
import { useAuth } from './auth-context';
import { AuthLayout } from './AuthLayout';

export function MfaSetupPage() {
  const { t } = useTranslation();
  const { completeLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const token = (location.state as { token?: string } | null)?.token;
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    void authApi
      .mfaSetup(token)
      .then(setSetup)
      .catch((caught: unknown) => {
        setError(
          caught instanceof ApiClientError
            ? authErrorText(t, caught.code, caught.message)
            : t('auth.errors.generic'),
        );
      });
  }, [token, t]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError(null);
    try {
      const response = await authApi.mfaActivate(token, code);
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
      title={t('auth.mfa.setupTitle')}
      description={t('auth.mfa.setupDescription')}
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
          {t('auth.mfa.missingSetup')}
        </Alert>
      ) : (
        <div className="space-y-4">
          {error ? (
            <Alert variant="danger" role="alert">
              {error}
            </Alert>
          ) : null}
          {setup ? (
            <>
              <Alert variant="info">{t('auth.mfa.setupInstructions')}</Alert>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('auth.mfa.secretTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <code className="block break-all rounded-md bg-muted p-3 font-mono text-sm">
                    {setup.secret}
                  </code>
                  <p className="text-xs text-muted-foreground">{t('auth.mfa.secretHint')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('auth.mfa.recoveryCodesTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {t('auth.mfa.recoveryCodesHint')}
                  </p>
                  <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
                    {setup.recoveryCodes.map((recoveryCode) => (
                      <li key={recoveryCode}>{recoveryCode}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          ) : !error ? (
            <Alert role="status">{t('auth.mfa.preparing')}</Alert>
          ) : null}

          <form className="space-y-4" onSubmit={onSubmit}>
            <Field id="mfa-activate-code" label={t('auth.mfa.activateCodeLabel')}>
              <Input
                id="mfa-activate-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={pending || !setup}>
              {t('auth.mfa.activate')}
            </Button>
          </form>
        </div>
      )}
    </AuthLayout>
  );
}
