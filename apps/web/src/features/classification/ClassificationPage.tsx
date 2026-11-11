import { ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type {
  ClassificationCatalog,
  ClassificationRun,
  ClassificationRunSummary,
} from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAuth } from '@/features/auth/auth-context';
import { ApiClientError, classificationApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ClassificationResultView } from './ClassificationResultView';
import { ClassificationWizard } from './ClassificationWizard';

const resultVariant: Record<
  ClassificationRunSummary['result'],
  'danger' | 'warning' | 'success' | 'neutral'
> = {
  ESSENTIAL: 'danger',
  IMPORTANT: 'warning',
  LIKELY_IN_SCOPE: 'warning',
  OUT_OF_SCOPE: 'success',
};

export function ClassificationPage() {
  const { t, i18n } = useTranslation();
  const { activeOrganization, activeOrganizationId } = useAuth();
  const [catalog, setCatalog] = useState<ClassificationCatalog | null>(null);
  const [current, setCurrent] = useState<ClassificationRun | null>(null);
  const [history, setHistory] = useState<ClassificationRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'result' | 'wizard'>('wizard');

  const load = useCallback(async () => {
    if (!activeOrganizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextCatalog, nextCurrent, nextHistory] = await Promise.all([
        classificationApi.catalog(),
        classificationApi.current(),
        classificationApi.runs(),
      ]);
      setCatalog(nextCatalog);
      setCurrent(nextCurrent);
      setHistory(nextHistory);
      setMode(nextCurrent ? 'result' : 'wizard');
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('classification.loadError'));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!activeOrganizationId || !activeOrganization) {
    return (
      <div className="container space-y-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{t('classification.title')}</h1>
        <Alert variant="info">
          {t('classification.noOrganization')}{' '}
          <Link className="font-semibold underline" to="/organizations">
            {t('classification.chooseOrganization')}
          </Link>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{activeOrganization.name}</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ShieldCheck className="h-7 w-7 text-primary-600" aria-hidden="true" />
            {t('classification.title')}
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{t('classification.subtitle')}</p>
        </div>
        {current && mode === 'result' ? (
          <Button onClick={() => setMode('wizard')}>{t('classification.rerun')}</Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Alert role="status">{t('classification.loading')}</Alert>
      ) : !catalog ? (
        <Alert variant="warning">{t('classification.catalogUnavailable')}</Alert>
      ) : mode === 'wizard' ? (
        <ClassificationWizard
          catalog={catalog}
          initial={current?.inputs ?? null}
          onCancel={current ? () => setMode('result') : undefined}
          onSubmitted={(run) => {
            setCurrent(run);
            setMode('result');
            void load();
          }}
        />
      ) : current ? (
        <ClassificationResultView run={current} onRerun={() => setMode('wizard')} />
      ) : (
        <Alert variant="info">{t('classification.startPrompt')}</Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('classification.historyTitle')}</CardTitle>
          <CardDescription>{t('classification.historySubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <Alert variant="info">{t('classification.historyEmpty')}</Alert>
          ) : (
            <ul className="space-y-2">
              {history.map((run) => (
                <li
                  key={run.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={resultVariant[run.result]}>
                      {t(`classification.outcomes.${run.result}`)}
                    </Badge>
                    <span className="text-sm font-medium">
                      {t('classification.version', { version: run.version })}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t('classification.createdAt', {
                        date: formatDateTime(run.createdAt, i18n.language),
                      })}
                    </span>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/classification/runs/${run.id}`}>{t('classification.view')}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Alert variant="warning">{t('classification.disclaimer')}</Alert>
    </div>
  );
}
