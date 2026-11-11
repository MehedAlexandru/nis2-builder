import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExportFormat, ExportJobSummary, ExportLocale } from '@nis2/shared';
import { ApiClientError, exportsApi } from '@/lib/api';
import { downloadBlob } from '@/lib/download';

const POLL_INTERVAL_MS = 1200;
const MAX_WAIT_MS = 180_000;

export function useDocumentExport() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedJob, setCompletedJob] = useState<ExportJobSummary | null>(null);

  const run = useCallback(
    async (key: string, start: () => Promise<ExportJobSummary>) => {
      setPending(key);
      setError(null);
      try {
        let job = await start();
        const deadline = Date.now() + MAX_WAIT_MS;
        while (job.status === 'QUEUED' || job.status === 'PROCESSING') {
          if (Date.now() > deadline) {
            throw new Error(t('documents.exportTimeout'));
          }
          await delay(POLL_INTERVAL_MS);
          job = await exportsApi.get(job.id);
        }
        if (job.status === 'FAILED') {
          throw new Error(job.errorMessage ?? t('documents.exportFailed'));
        }
        setCompletedJob(job);
        const blob = await exportsApi.download(job.id);
        downloadBlob(blob, job.filename ?? `nis2-export-${job.id}`);
      } catch (caught) {
        setError(
          caught instanceof ApiClientError
            ? caught.message
            : caught instanceof Error
              ? caught.message
              : t('documents.exportFailed'),
        );
      } finally {
        setPending(null);
      }
    },
    [t],
  );

  const exportDocument = useCallback(
    (documentId: string, format: ExportFormat, locale: ExportLocale) =>
      run(`document-${documentId}-${format}`, () =>
        exportsApi.createDocument(documentId, { format, locale }),
      ),
    [run],
  );

  const exportBundle = useCallback(
    (locale: ExportLocale) => run('bundle', () => exportsApi.createBundle({ locale })),
    [run],
  );

  const exportSummary = useCallback(
    (format: ExportFormat, locale: ExportLocale) =>
      run(`summary-${format}`, () => exportsApi.createSummary({ format, locale })),
    [run],
  );

  const downloadJob = useCallback(
    (job: ExportJobSummary) => run(`existing-${job.id}`, async () => job),
    [run],
  );

  return {
    pending,
    error,
    completedJob,
    clearError: () => setError(null),
    exportDocument,
    exportBundle,
    exportSummary,
    downloadJob,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
