import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthSession } from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ApiClientError, authApi } from '@/lib/api';
import { authErrorText } from '@/features/auth/auth-errors';
import { formatDateTime } from '@/lib/format';

export function SessionsPage() {
  const { t, i18n } = useTranslation();
  const [sessions, setSessions] = useState<AuthSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      setSessions(await authApi.sessions());
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? authErrorText(t, caught.code, caught.message)
          : t('auth.errors.generic'),
      );
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revoke = async (session: AuthSession) => {
    setRevoking(session.id);
    try {
      await authApi.revokeSession(session.id);
      await load();
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="container space-y-6 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('auth.sessions.title')}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('auth.sessions.subtitle')}</p>
      </div>

      {error ? (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {sessions === null ? (
        <Alert role="status">{t('auth.sessions.loading')}</Alert>
      ) : sessions.length === 0 ? (
        <Alert variant="info">{t('auth.sessions.empty')}</Alert>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => (
            <li key={session.id}>
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="text-base">
                      {session.userAgent ?? t('auth.sessions.unknownDevice')}
                    </CardTitle>
                    <CardDescription>
                      {t('auth.sessions.lastSeen')}:{' '}
                      {formatDateTime(session.lastSeenAt, i18n.language)}
                      {session.ip ? ` · ${session.ip}` : ''}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {session.current ? (
                      <Badge variant="success">{t('auth.sessions.thisDevice')}</Badge>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={revoking === session.id}
                      onClick={() => void revoke(session)}
                    >
                      {t('auth.sessions.revoke')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {t('auth.sessions.started')}: {formatDateTime(session.createdAt, i18n.language)}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
