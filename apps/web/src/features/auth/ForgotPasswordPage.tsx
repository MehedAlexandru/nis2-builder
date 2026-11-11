import { Link } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { authApi } from '@/lib/api';
import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title={t('auth.forgot.title')}
      description={t('auth.forgot.description')}
      footer={
        <Link
          className="font-medium text-primary-700 hover:underline dark:text-primary-300"
          to="/login"
        >
          {t('auth.login.submit')}
        </Link>
      }
    >
      {sent ? (
        <Alert variant="success" role="status">
          {t('auth.forgot.sent')}
        </Alert>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field id="forgot-email" label={t('auth.fields.email')}>
            <Input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {t('auth.forgot.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
