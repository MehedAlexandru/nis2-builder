import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { ClassificationRun } from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/auth-context';
import { ApiClientError, classificationApi } from '@/lib/api';
import { ClassificationResultView } from './ClassificationResultView';

export function ClassificationResultPage() {
  const { t } = useTranslation();
  const { runId } = useParams<{ runId: string }>();
  const { activeOrganizationId } = useAuth();
  const [run, setRun] = useState<ClassificationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || !activeOrganizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        setRun(await classificationApi.run(runId));
      } catch (caught) {
        setError(caught instanceof ApiClientError ? caught.message : t('classification.loadError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [runId, activeOrganizationId, t]);

  return (
    <div className="container space-y-6 py-10">
      <Button asChild variant="ghost" size="sm">
        <Link to="/classification">
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('classification.backToOverview')}
        </Link>
      </Button>

      {error ? (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      ) : loading ? (
        <Alert role="status">{t('classification.loading')}</Alert>
      ) : run ? (
        <ClassificationResultView run={run} />
      ) : (
        <Alert variant="info">{t('classification.notFound')}</Alert>
      )}
    </div>
  );
}
