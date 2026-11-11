import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ApiClientError, authApi } from '@/lib/api';
import { authErrorText } from './auth-errors';
import { AuthLayout } from './AuthLayout';

type State = 'idle' | 'working' | 'success' | 'error';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;
    setState('working');
    void authApi
      .verifyEmail(token)
      .then((result) => {
        setMessage(result.message);
        setState('success');
      })
      .catch((error: unknown) => {
        setMessage(
          error instanceof ApiClientError
            ? authErrorText(t, error.code, error.message)
            : t('auth.errors.generic'),
        );
        setState('error');
      });
  }, [token, t]);

  const resend = async () => {
    setResent(false);
    try {
      await authApi.resendVerification(email);
    } finally {
      setResent(true);
    }
  };

  return (
    <AuthLayout title={t('auth.verify.title')} description={t('auth.verify.description')}>
      <div className="space-y-4">
        {!token ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void resend();
            }}
          >
            <Field id="resend-email" label={t('auth.fields.email')}>
              <Input
                id="resend-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full">
              {t('auth.verify.resend')}
            </Button>
          </form>
        ) : null}

        {state === 'working' ? <Alert role="status">{t('auth.verify.working')}</Alert> : null}
        {state === 'success' ? (
          <Alert variant="success" role="status">
            {message ?? t('auth.verify.success')}
          </Alert>
        ) : null}
        {state === 'error' ? (
          <Alert variant="danger" role="alert">
            {message ?? t('auth.verify.error')}
          </Alert>
        ) : null}
        {resent ? (
          <Alert variant="info" role="status">
            {t('auth.verify.resent')}
          </Alert>
        ) : null}

        <Card>
          <CardContent className="p-0">
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">{t('auth.login.submit')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
}
