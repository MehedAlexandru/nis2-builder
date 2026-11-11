import {
  AlertTriangle,
  Clock,
  Download,
  FileText,
  ImagePlus,
  Lock,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type {
  ClassificationResult,
  DocumentCard,
  DocumentCatalog,
  DocumentStatus,
  ExportFormat,
  ExportJobSummary,
  LocalizedText,
} from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Progress } from '@/components/ui/Progress';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { useAuth } from '@/features/auth/auth-context';
import { ApiClientError, documentsApi, exportsApi, organizationsApi } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { useDocumentExport } from './useDocumentExport';

const statusVariant: Record<DocumentStatus, 'neutral' | 'primary' | 'success' | 'warning'> = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'primary',
  COMPLETE: 'success',
  NEEDS_REVIEW: 'warning',
};

const statusOptions: Array<DocumentStatus | 'ALL'> = [
  'ALL',
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETE',
  'NEEDS_REVIEW',
];

export function DocumentsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { activeOrganization, activeOrganizationId } = useAuth();
  const [catalog, setCatalog] = useState<DocumentCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<DocumentStatus | 'ALL'>('ALL');
  const [category, setCategory] = useState('ALL');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [recentExports, setRecentExports] = useState<ExportJobSummary[]>([]);
  const exports = useDocumentExport();
  const locale = i18n.language.startsWith('ro') ? 'ro' : 'en';

  const localized = useCallback(
    (value: LocalizedText) => (i18n.language.startsWith('ro') ? value.ro : value.en),
    [i18n.language],
  );

  const load = useCallback(async () => {
    if (!activeOrganizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextCatalog, nextExports] = await Promise.all([
        documentsApi.catalog(),
        exportsApi.list().catch(() => []),
      ]);
      setCatalog(nextCatalog);
      setRecentExports(nextExports);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('documents.loadError'));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!exports.completedJob) return;
    exportsApi
      .list()
      .then(setRecentExports)
      .catch(() => undefined);
  }, [exports.completedJob]);

  useEffect(() => {
    if (!activeOrganizationId) {
      setLogoUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    organizationsApi
      .logo(activeOrganizationId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLogoUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setLogoUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeOrganizationId, logoVersion]);

  const categories = useMemo(
    () => [...new Set((catalog?.templates ?? []).map((card) => card.category))].sort(),
    [catalog],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (catalog?.templates ?? []).filter((card) => {
      if (status !== 'ALL' && card.status !== status) return false;
      if (category !== 'ALL' && card.category !== category) return false;
      if (!term) return true;
      return (
        localized(card.title).toLowerCase().includes(term) ||
        localized(card.shortDescription).toLowerCase().includes(term) ||
        card.legalReference.toLowerCase().includes(term)
      );
    });
  }, [catalog, category, localized, search, status]);

  const openDocument = async (card: DocumentCard) => {
    if (card.lockedByOther) return;
    if (card.documentId) {
      navigate(`/documents/${card.documentId}`);
      return;
    }
    setOpening(card.templateKey);
    setError(null);
    try {
      const detail = await documentsApi.open(card.templateKey);
      navigate(`/documents/${detail.id}`);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('documents.openError'));
    } finally {
      setOpening(null);
    }
  };

  const downloadDocument = async (card: DocumentCard, format: ExportFormat) => {
    let documentId = card.documentId;
    if (!documentId) {
      try {
        documentId = (await documentsApi.open(card.templateKey)).id;
      } catch (caught) {
        setError(caught instanceof ApiClientError ? caught.message : t('documents.openError'));
        return;
      }
    }
    await exports.exportDocument(documentId, format, locale);
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file || !activeOrganizationId) return;
    setLogoError(null);
    if (file.size > 2 * 1024 * 1024) {
      setLogoError(t('documents.logoTooLarge'));
      return;
    }
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      setLogoError(t('documents.logoType'));
      return;
    }
    setLogoBusy(true);
    try {
      const dataUrl = await readFile(file);
      await organizationsApi.uploadLogo(activeOrganizationId, {
        filename: file.name,
        mimeType: file.type,
        dataBase64: dataUrl.split(',')[1] ?? '',
      });
      setLogoVersion((version) => version + 1);
    } catch (caught) {
      setLogoError(caught instanceof ApiClientError ? caught.message : t('documents.logoError'));
    } finally {
      setLogoBusy(false);
    }
  };

  if (!activeOrganizationId || !activeOrganization) {
    return (
      <div className="container space-y-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{t('documents.title')}</h1>
        <Alert variant="info">{t('documents.noOrganization')}</Alert>
      </div>
    );
  }

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{activeOrganization.name}</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
            <FileText className="h-7 w-7 text-primary-600" aria-hidden="true" />
            {t('documents.title')}
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{t('documents.subtitle')}</p>
        </div>
        {catalog ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
              <ProgressRing value={catalog.overallProgress} label={t('documents.overall')} />
              <div className="space-y-1 text-sm">
                <p className="font-semibold">
                  {catalog.requiredCount > 0
                    ? t('documents.requiredComplete', {
                        completed: catalog.completedCount,
                        total: catalog.requiredCount,
                      })
                    : t('documents.classificationPending')}
                </p>
                {catalog.classificationResult ? (
                  <Badge variant="primary">
                    {t(
                      `classification.outcomes.${catalog.classificationResult as ClassificationResult}`,
                    )}
                  </Badge>
                ) : (
                  <Badge variant="warning">{t('documents.noClassification')}</Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(exports.pending)}
                onClick={() => void exports.exportSummary('PDF', locale)}
              >
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {exports.pending === 'summary-PDF'
                  ? t('documents.exportPreparing')
                  : t('documents.exportSummary')}
              </Button>
              <Button
                size="sm"
                disabled={Boolean(exports.pending)}
                onClick={() => void exports.exportBundle(locale)}
              >
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {exports.pending === 'bundle'
                  ? t('documents.exportPreparing')
                  : t('documents.exportAll')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {exports.error ? (
        <Alert variant="danger" role="alert">
          {exports.error}
        </Alert>
      ) : null}

      {loading ? (
        <Alert role="status">{t('documents.loading')}</Alert>
      ) : !catalog ? (
        <Alert variant="warning">{t('documents.catalogUnavailable')}</Alert>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('documents.searchPlaceholder')}
                  aria-label={t('documents.searchPlaceholder')}
                  className="pl-9"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t('documents.filterStatus')}</span>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as DocumentStatus | 'ALL')}
                >
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === 'ALL'
                        ? t('documents.status.ALL')
                        : t(`documents.status.${option}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t('documents.filterCategory')}</span>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="ALL">{t('documents.allCategories')}</option>
                  {categories.map((value) => (
                    <option key={value} value={value}>
                      {t(`documents.categories.${value}`, { defaultValue: value })}
                    </option>
                  ))}
                </select>
              </label>
            </CardContent>
          </Card>

          {filtered.length === 0 ? (
            <Alert variant="info">{t('documents.noResults')}</Alert>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((card) => (
                <Card key={card.templateKey} className="flex h-full flex-col">
                  <CardHeader className="gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant[card.status]}>
                          {t(`documents.status.${card.status}`)}
                        </Badge>
                        {card.required ? (
                          <Badge variant="primary">{t('documents.required')}</Badge>
                        ) : (
                          <Badge variant="neutral">{t('documents.optional')}</Badge>
                        )}
                        {card.isOverdue ? (
                          <Badge variant="danger">
                            <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
                            {t('documents.overdue')}
                          </Badge>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        {card.legalReference}
                      </span>
                    </div>
                    <CardTitle className="text-base leading-snug">
                      {localized(card.title)}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {localized(card.shortDescription)}
                    </p>
                  </CardHeader>
                  <CardContent className="mt-auto space-y-4">
                    <Progress
                      value={card.progress}
                      label={t('documents.card.progress')}
                      showValue
                    />
                    <dl className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">{t('documents.card.version')}</dt>
                        <dd className="font-medium">
                          {card.currentVersionLabel ?? t('documents.card.noVersion')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t('documents.card.ownerRole')}</dt>
                        <dd className="font-medium">{card.ownerRole}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t('documents.card.lastEdited')}</dt>
                        <dd className="font-medium">
                          {card.lastEditedAt
                            ? formatDateTime(card.lastEditedAt, i18n.language)
                            : t('documents.card.never')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t('documents.card.nextReview')}</dt>
                        <dd className="font-medium">
                          {card.nextReviewDate
                            ? formatDate(card.nextReviewDate, i18n.language)
                            : t('documents.card.notSet')}
                        </dd>
                      </div>
                    </dl>
                    {card.lastEditedByName ? (
                      <p className="text-xs text-muted-foreground">
                        {t('documents.card.editedBy', { name: card.lastEditedByName })}
                      </p>
                    ) : null}
                    {card.lockedByOther ? (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-warning-700">
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('documents.card.locked')}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => void openDocument(card)}
                        disabled={opening === card.templateKey || card.lockedByOther}
                      >
                        {opening === card.templateKey
                          ? t('documents.card.opening')
                          : card.progress > 0
                            ? t('documents.card.continue')
                            : t('documents.card.start')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={Boolean(exports.pending)}
                        onClick={() => void downloadDocument(card, 'DOCX')}
                      >
                        <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        DOCX
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={Boolean(exports.pending)}
                        onClick={() => void downloadDocument(card, 'PDF')}
                      >
                        <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {recentExports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4 text-primary-600" aria-hidden="true" />
              {t('documents.exports.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentExports.slice(0, 6).map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      job.status === 'READY'
                        ? 'success'
                        : job.status === 'FAILED'
                          ? 'danger'
                          : 'primary'
                    }
                  >
                    {t(`documents.exports.status.${job.status}`)}
                  </Badge>
                  <span className="text-sm font-medium">
                    {t(`documents.exports.types.${job.type}`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(job.createdAt, i18n.language)}
                  </span>
                  {job.errorMessage ? (
                    <span className="text-xs text-danger-600">{job.errorMessage}</span>
                  ) : null}
                </div>
                {job.downloadAvailable ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(exports.pending)}
                    onClick={() => void exports.downloadJob(job)}
                  >
                    <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('documents.exports.download')}
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {catalog?.profile ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary-600" aria-hidden="true" />
              {t('documents.profileTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex shrink-0 flex-col items-start gap-2">
              <div className="flex h-20 w-36 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={t('documents.profile.logoAlt')}
                    className="max-h-16 max-w-32 object-contain"
                  />
                ) : (
                  <ImagePlus className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              {activeOrganization.role === 'OWNER' ? (
                <>
                  <input
                    id="organization-logo"
                    type="file"
                    accept="image/png,image/jpeg"
                    className="sr-only"
                    onChange={(event) => void uploadLogo(event.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={logoBusy}
                    onClick={() => document.getElementById('organization-logo')?.click()}
                  >
                    <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {logoBusy
                      ? t('documents.profile.uploadingLogo')
                      : t('documents.profile.uploadLogo')}
                  </Button>
                </>
              ) : null}
              {logoError ? (
                <p role="alert" className="text-xs font-medium text-danger-600">
                  {logoError}
                </p>
              ) : null}
            </div>
            <div className="grid flex-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <ProfileItem
                label={t('documents.profile.legalName')}
                value={catalog.profile.legalName}
              />
              <ProfileItem
                label={t('documents.profile.registrationNumber')}
                value={catalog.profile.registrationNumber}
              />
              <ProfileItem label={t('documents.profile.city')} value={catalog.profile.city} />
              <ProfileItem label={t('documents.profile.ciso')} value={catalog.profile.cisoName} />
              <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                {t('documents.profileHint')}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {catalog && catalog.overallProgress < 100 ? (
        <Alert variant="warning">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('documents.legalReminder')}
          </span>
        </Alert>
      ) : null}
    </div>
  );
}

function ProfileItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? '—'}</p>
    </div>
  );
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read the selected file'));
    reader.readAsDataURL(file);
  });
}
