import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Lock,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  calculateDocumentProgress,
  diffDocumentPayloads,
  type DocumentDetail,
  type DocumentPayload,
  type DocumentRevisionDetail,
  type DocumentStatus,
  type DocumentVersion,
  type LocalizedText,
} from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Progress } from '@/components/ui/Progress';
import { ApiClientError, documentsApi } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { DocumentFieldRenderer } from './DocumentFieldRenderer';
import { useDocumentExport } from './useDocumentExport';

type Tab = 'document' | 'history' | 'versions';
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';

const statusVariant: Record<DocumentStatus, 'neutral' | 'primary' | 'success' | 'warning'> = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'primary',
  COMPLETE: 'success',
  NEEDS_REVIEW: 'warning',
};

const AUTOSAVE_MS = 2500;

export function DocumentEditorPage() {
  const { documentId = '' } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ro') ? 'ro' : 'en';
  const exporter = useDocumentExport();
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [payload, setPayload] = useState<DocumentPayload>({});
  const [classification, setClassification] = useState('INTERNAL');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [tab, setTab] = useState<Tab>('document');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [versionLabel, setVersionLabel] = useState('1.0');
  const [versionError, setVersionError] = useState<string | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [approvalRole, setApprovalRole] = useState('Management body');
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [leftRevisionNo, setLeftRevisionNo] = useState<number | null>(null);
  const [rightRevisionNo, setRightRevisionNo] = useState<number | null>(null);
  const [leftRevision, setLeftRevision] = useState<DocumentRevisionDetail | null>(null);
  const [rightRevision, setRightRevision] = useState<DocumentRevisionDetail | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const detailRef = useRef<DocumentDetail | null>(null);
  const payloadRef = useRef<DocumentPayload>({});
  const savingRef = useRef(false);
  const lockOwnedRef = useRef(false);
  const dirtyRef = useRef(false);

  const localized = useCallback(
    (value: LocalizedText) => (locale === 'ro' ? value.ro : value.en),
    [locale],
  );

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      let loaded = await documentsApi.detail(documentId);
      try {
        loaded = await documentsApi.lock(documentId);
        lockOwnedRef.current = true;
        setReadOnly(false);
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.code === 'DOCUMENT_LOCKED') {
          setReadOnly(true);
        } else {
          throw caught;
        }
      }
      detailRef.current = loaded;
      payloadRef.current = loaded.payload;
      setDetail(loaded);
      setPayload(loaded.payload);
      setClassification(loaded.classification);
      setNextReviewDate(loaded.nextReviewDate?.slice(0, 10) ?? '');
      setOpenSections(
        Object.fromEntries(loaded.template.sections.map((section) => [section.key, true])),
      );
      const latest = loaded.revisions[0]?.revisionNo ?? null;
      const previous = loaded.revisions[1]?.revisionNo ?? latest;
      setRightRevisionNo(latest);
      setLeftRevisionNo(previous);
      const latestVersion = loaded.versions[0]?.versionLabel;
      setVersionLabel(latestVersion ? bumpVersion(latestVersion) : '1.0');
      setSaveState('idle');
      setSaveError(null);
      dirtyRef.current = false;
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : i18n.t('documents.editor.loadError'),
      );
    } finally {
      setLoading(false);
    }
  }, [documentId, i18n]);

  useEffect(() => {
    void load();
    return () => {
      if (lockOwnedRef.current) {
        lockOwnedRef.current = false;
        void documentsApi.unlock(documentId).catch(() => undefined);
      }
    };
  }, [documentId, load]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  const progress = useMemo(
    () => (detail ? calculateDocumentProgress(detail.template, payload) : null),
    [detail, payload],
  );

  const issueByField = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of progress?.issues ?? []) {
      if (!map.has(issue.fieldKey)) map.set(issue.fieldKey, issue.message);
    }
    return map;
  }, [progress]);

  const performSave = useCallback(
    async (changeNote?: string) => {
      if (!detailRef.current || savingRef.current || readOnly) return;
      savingRef.current = true;
      setSaveState('saving');
      setSaveError(null);
      const snapshot = payloadRef.current;
      const snapshotJson = JSON.stringify(snapshot);
      const currentDetail = detailRef.current;
      const revisionNo = currentDetail.currentRevisionNo;
      const currentReviewDate = currentDetail.nextReviewDate?.slice(0, 10) ?? '';
      const reviewChanged = nextReviewDate !== currentReviewDate;
      const classificationChanged = classification !== currentDetail.classification;
      try {
        const updated = await documentsApi.save(documentId, {
          payload: snapshot,
          expectedRevisionNo: revisionNo,
          changeNote,
          classification: classificationChanged
            ? (classification as DocumentDetail['classification'])
            : undefined,
          nextReviewDate: reviewChanged
            ? nextReviewDate
              ? new Date(`${nextReviewDate}T00:00:00Z`).toISOString()
              : null
            : undefined,
        });
        detailRef.current = updated;
        setDetail(updated);
        if (JSON.stringify(payloadRef.current) === snapshotJson) {
          dirtyRef.current = false;
          setSaveState('saved');
        } else {
          setSaveState('dirty');
        }
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.code === 'DOCUMENT_CONFLICT') {
          setSaveState('conflict');
          setSaveError(t('documents.editor.conflict'));
        } else {
          setSaveState('error');
          setSaveError(
            caught instanceof ApiClientError ? caught.message : t('documents.editor.saveError'),
          );
        }
      } finally {
        savingRef.current = false;
      }
    },
    [classification, documentId, nextReviewDate, readOnly, t],
  );

  useEffect(() => {
    if (saveState !== 'dirty' || readOnly) return;
    const timer = window.setTimeout(() => {
      void performSave();
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [performSave, readOnly, saveState]);

  useEffect(() => {
    if (tab !== 'history' || !leftRevisionNo || !rightRevisionNo) return;
    let cancelled = false;
    setDiffLoading(true);
    Promise.all([
      documentsApi.revision(documentId, leftRevisionNo),
      documentsApi.revision(documentId, rightRevisionNo),
    ])
      .then(([left, right]) => {
        if (cancelled) return;
        setLeftRevision(left);
        setRightRevision(right);
      })
      .catch(() => {
        if (!cancelled) setDiffLoading(false);
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, leftRevisionNo, rightRevisionNo, tab]);

  const updateField = (key: string, value: unknown) => {
    if (readOnly) return;
    const next = { ...payloadRef.current, [key]: value };
    payloadRef.current = next;
    setPayload(next);
    dirtyRef.current = true;
    setSaveState('dirty');
  };

  const updateLifecycle = (nextClassification: string, nextReview: string) => {
    if (readOnly) return;
    setClassification(nextClassification);
    setNextReviewDate(nextReview);
    dirtyRef.current = true;
    setSaveState('dirty');
  };

  const exportCurrent = async (format: 'DOCX' | 'PDF') => {
    if (dirtyRef.current && !readOnly) await performSave();
    await exporter.exportDocument(documentId, format, locale);
  };

  const handleBack = async () => {
    if (dirtyRef.current && !readOnly) await performSave();
    if (lockOwnedRef.current) {
      lockOwnedRef.current = false;
      await documentsApi.unlock(documentId).catch(() => undefined);
    }
    navigate('/documents');
  };

  const restore = async (revisionNo: number) => {
    if (!window.confirm(t('documents.history.restoreConfirm', { revision: revisionNo }))) return;
    try {
      const updated = await documentsApi.restore(documentId, revisionNo, {
        revisionNo,
        changeNote: t('documents.history.restoreNote', { revision: revisionNo }),
      });
      detailRef.current = updated;
      payloadRef.current = updated.payload;
      setDetail(updated);
      setPayload(updated.payload);
      setClassification(updated.classification);
      setNextReviewDate(updated.nextReviewDate?.slice(0, 10) ?? '');
      dirtyRef.current = false;
      setSaveState('saved');
      setTab('document');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : t('documents.history.restoreError'),
      );
    }
  };

  const publish = async () => {
    setVersionError(null);
    try {
      const updated = await documentsApi.publish(documentId, { versionLabel });
      detailRef.current = updated;
      setDetail(updated);
      setVersionLabel(bumpVersion(versionLabel));
    } catch (caught) {
      setVersionError(
        caught instanceof ApiClientError ? caught.message : t('documents.versions.publishError'),
      );
    }
  };

  const approve = async (version: DocumentVersion) => {
    setApprovalError(null);
    try {
      const updated = await documentsApi.approve(documentId, version.id, {
        role: approvalRole,
        comment: approvalComment || undefined,
      });
      detailRef.current = updated;
      setDetail(updated);
      setApprovalComment('');
    } catch (caught) {
      setApprovalError(
        caught instanceof ApiClientError ? caught.message : t('documents.versions.approveError'),
      );
    }
  };

  if (loading) {
    return (
      <div className="container py-10">
        <Alert role="status">{t('documents.editor.loading')}</Alert>
      </div>
    );
  }

  if (error || !detail || !progress) {
    return (
      <div className="container space-y-4 py-10">
        <Button variant="outline" onClick={() => void handleBack()}>
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('documents.editor.back')}
        </Button>
        <Alert variant="danger" role="alert">
          {error ?? t('documents.editor.loadError')}
        </Alert>
      </div>
    );
  }

  const saveLabel =
    saveState === 'saving'
      ? t('documents.editor.saving')
      : saveState === 'saved'
        ? t('documents.editor.saved')
        : saveState === 'conflict'
          ? t('documents.editor.conflictShort')
          : saveState === 'dirty'
            ? t('documents.editor.unsaved')
            : t('documents.editor.ready');

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => void handleBack()}>
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('documents.editor.back')}
        </Button>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium',
              saveState === 'error' || saveState === 'conflict'
                ? 'bg-danger-100 text-danger-700 dark:bg-danger-700/30 dark:text-danger-100'
                : saveState === 'dirty'
                  ? 'bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100'
                  : 'bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-100',
            )}
            role="status"
          >
            {saveState === 'saving' ? (
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {saveLabel}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void performSave(t('documents.editor.manualSaveNote'))}
            disabled={readOnly || saveState === 'saving'}
          >
            <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('documents.editor.saveNow')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant[detail.status]}>
              {t(`documents.status.${detail.status}`)}
            </Badge>
            <span className="text-xs font-medium text-muted-foreground">
              {detail.template.legalReference}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {localized(detail.template.title)}
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            {localized(detail.template.shortDescription)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('documents.editor.lastEdited', {
              date: detail.lastEditedAt ? formatDateTime(detail.lastEditedAt, i18n.language) : '—',
              name: detail.lastEditedByName ?? '—',
            })}
          </p>
        </div>
        <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-card p-4">
          <Progress value={progress.percentage} label={t('documents.editor.progress')} />
          <p className="text-xs text-muted-foreground">
            {t('documents.editor.remaining', { count: progress.requiredRemaining })}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="document-classification" label={t('documents.editor.classification')}>
              <select
                id="document-classification"
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={classification}
                disabled={readOnly}
                onChange={(event) => updateLifecycle(event.target.value, nextReviewDate)}
              >
                <option value="PUBLIC">{t('documents.classification.PUBLIC')}</option>
                <option value="INTERNAL">{t('documents.classification.INTERNAL')}</option>
                <option value="CONFIDENTIAL">{t('documents.classification.CONFIDENTIAL')}</option>
              </select>
            </Field>
            <Field id="document-review-date" label={t('documents.editor.nextReview')}>
              <Input
                id="document-review-date"
                type="date"
                value={nextReviewDate}
                disabled={readOnly}
                onChange={(event) => updateLifecycle(classification, event.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('documents.editor.owner', {
              role: detail.template.ownerRole,
              name: detail.ownerName ?? '—',
            })}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(exporter.pending)}
              onClick={() => void exportCurrent('DOCX')}
            >
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              DOCX
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(exporter.pending)}
              onClick={() => void exportCurrent('PDF')}
            >
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              PDF
            </Button>
          </div>
        </div>
      </div>

      {readOnly ? (
        <Alert variant="warning">
          <span className="flex items-center gap-2">
            <Lock className="h-4 w-4" aria-hidden="true" />
            {t('documents.editor.readOnly', { name: detail.lock.ownerName ?? '—' })}
          </span>
        </Alert>
      ) : null}

      {saveState === 'conflict' ? (
        <Alert variant="danger" role="alert">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t('documents.editor.conflict')}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              {t('documents.editor.reload')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {saveState === 'error' && saveError ? (
        <Alert variant="danger" role="alert">
          {saveError}
        </Alert>
      ) : null}

      {exporter.error ? (
        <Alert variant="danger" role="alert">
          {exporter.error}
        </Alert>
      ) : null}

      <div
        role="tablist"
        aria-label={t('documents.editor.tabsLabel')}
        className="flex gap-1 border-b border-border"
      >
        {(['document', 'history', 'versions'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === value
                ? 'border-primary-600 text-primary-700 dark:border-primary-300 dark:text-primary-200'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTab(value)}
          >
            {t(`documents.editor.tabs.${value}`)}
          </button>
        ))}
      </div>

      {tab === 'document' ? (
        <div className="space-y-5">
          {detail.template.sections.map((section) => {
            const sectionProgress = progress.sections.find((entry) => entry.key === section.key);
            const open = openSections[section.key] ?? true;
            return (
              <Card key={section.key}>
                <CardHeader className="gap-1">
                  <button
                    type="button"
                    className="flex items-center justify-between gap-3 text-left"
                    aria-expanded={open}
                    onClick={() =>
                      setOpenSections((current) => ({ ...current, [section.key]: !open }))
                    }
                  >
                    <CardTitle className="text-base">{localized(section.title)}</CardTitle>
                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{sectionProgress?.percentage ?? 0}%</span>
                      <span aria-hidden="true">{open ? '−' : '+'}</span>
                    </span>
                  </button>
                  {section.description ? (
                    <p className="text-sm text-muted-foreground">
                      {localized(section.description)}
                    </p>
                  ) : null}
                </CardHeader>
                {open ? (
                  <CardContent className="space-y-6">
                    {section.fields
                      .filter((field) => isVisible(field, payload))
                      .map((field) => (
                        <DocumentFieldRenderer
                          key={field.key}
                          field={field}
                          value={payload[field.key]}
                          error={issueByField.get(field.key)}
                          locale={locale}
                          onChange={(value) => updateField(field.key, value)}
                        />
                      ))}
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
          <Alert variant="info">
            <span className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t('documents.editor.auditHint')}
            </span>
          </Alert>
        </div>
      ) : null}

      {tab === 'history' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,340px)_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('documents.history.title')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('documents.history.subtitle')}</p>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {detail.revisions.map((revision) => (
                  <li key={revision.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">
                          {t('documents.history.revision', { number: revision.revisionNo })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(revision.createdAt, i18n.language)} ·{' '}
                          {revision.createdByName ?? '—'}
                        </p>
                        {revision.changeNote ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {revision.changeNote}
                          </p>
                        ) : null}
                        {revision.changedFields.length > 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('documents.history.changed', {
                              count: revision.changedFields.length,
                            })}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <select
                          aria-label={t('documents.history.compareRevision', {
                            number: revision.revisionNo,
                          })}
                          className="h-8 rounded-md border border-input bg-background text-xs"
                          value={
                            leftRevisionNo === revision.revisionNo
                              ? 'left'
                              : rightRevisionNo === revision.revisionNo
                                ? 'right'
                                : ''
                          }
                          onChange={(event) => {
                            if (event.target.value === 'left')
                              setLeftRevisionNo(revision.revisionNo);
                            if (event.target.value === 'right')
                              setRightRevisionNo(revision.revisionNo);
                          }}
                        >
                          <option value="">—</option>
                          <option value="left">{t('documents.history.left')}</option>
                          <option value="right">{t('documents.history.right')}</option>
                        </select>
                        {revision.revisionNo !== detail.currentRevisionNo ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void restore(revision.revisionNo)}
                            disabled={readOnly}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            {t('documents.history.restore')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('documents.history.diffTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('documents.history.diffSubtitle')}</p>
            </CardHeader>
            <CardContent>
              {diffLoading ? (
                <Alert role="status">{t('documents.history.diffLoading')}</Alert>
              ) : leftRevision && rightRevision ? (
                <RevisionDiff
                  detail={detail}
                  left={leftRevision}
                  right={rightRevision}
                  locale={locale}
                  t={t}
                />
              ) : (
                <Alert variant="info">{t('documents.history.selectTwo')}</Alert>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'versions' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('documents.versions.publishTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('documents.versions.publishSubtitle')}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field id="version-label" label={t('documents.versions.label')}>
                <Input
                  id="version-label"
                  value={versionLabel}
                  onChange={(event) => setVersionLabel(event.target.value)}
                  placeholder="1.0"
                  disabled={readOnly}
                />
              </Field>
              {versionError ? (
                <Alert variant="danger" role="alert">
                  {versionError}
                </Alert>
              ) : null}
              <Button
                onClick={() => void publish()}
                disabled={readOnly || !/^\d+\.\d+$/.test(versionLabel)}
              >
                {t('documents.versions.publish')}
              </Button>
              <p className="text-xs text-muted-foreground">{t('documents.versions.publishHint')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('documents.versions.title')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('documents.versions.subtitle')}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {detail.versions.length === 0 ? (
                <Alert variant="info">{t('documents.versions.empty')}</Alert>
              ) : (
                detail.versions.map((version) => (
                  <div key={version.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            version.status === 'APPROVED'
                              ? 'success'
                              : version.status === 'SUPERSEDED'
                                ? 'neutral'
                                : 'primary'
                          }
                        >
                          {t(`documents.versions.status.${version.status}`)}
                        </Badge>
                        <p className="font-semibold">v{version.versionLabel}</p>
                        <span className="text-xs text-muted-foreground">
                          {t('documents.versions.fromRevision', { number: version.revisionNo })}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(version.createdAt, i18n.language)}
                      </span>
                    </div>
                    {version.approvedAt ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t('documents.versions.approvedAt', {
                          date: formatDateTime(version.approvedAt, i18n.language),
                        })}
                      </p>
                    ) : null}
                    {version.approvals.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {version.approvals.map((approval) => (
                          <li key={approval.id}>
                            {approval.approverName ?? '—'}
                            {approval.role ? ` · ${approval.role}` : ''}
                            {approval.comment ? ` · ${approval.comment}` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {version.status !== 'APPROVED' && version.status !== 'SUPERSEDED' ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <Input
                          value={approvalRole}
                          onChange={(event) => setApprovalRole(event.target.value)}
                          aria-label={t('documents.versions.approverRole')}
                          placeholder={t('documents.versions.approverRole')}
                          disabled={readOnly}
                        />
                        <Input
                          value={approvalComment}
                          onChange={(event) => setApprovalComment(event.target.value)}
                          aria-label={t('documents.versions.comment')}
                          placeholder={t('documents.versions.comment')}
                          disabled={readOnly}
                        />
                        <Button size="sm" onClick={() => void approve(version)} disabled={readOnly}>
                          {t('documents.versions.approve')}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
              {approvalError ? (
                <Alert variant="danger" role="alert">
                  {approvalError}
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Alert variant="warning">
        <span className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t('documents.disclaimer')}
        </span>
      </Alert>
    </div>
  );
}

function RevisionDiff({
  detail,
  left,
  right,
  locale,
  t,
}: {
  detail: DocumentDetail;
  left: DocumentRevisionDetail;
  right: DocumentRevisionDetail;
  locale: 'en' | 'ro';
  t: TFunction;
}) {
  const changed = diffDocumentPayloads(detail.template, left.payload, right.payload);
  const fields = detail.template.sections.flatMap((section) => section.fields);
  const rows = fields.filter((field) => changed.includes(field.key));

  if (rows.length === 0) {
    return <Alert variant="info">{t('documents.history.noDiff')}</Alert>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="w-1/4 px-3 py-2 font-semibold">{t('documents.history.field')}</th>
            <th className="w-[37.5%] px-3 py-2 font-semibold">
              {t('documents.history.revision', { number: left.revisionNo })}
            </th>
            <th className="w-[37.5%] px-3 py-2 font-semibold">
              {t('documents.history.revision', { number: right.revisionNo })}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((field) => (
            <tr key={field.key}>
              <td className="px-3 py-2 align-top font-medium">
                {locale === 'ro' ? field.label.ro : field.label.en}
              </td>
              <td className="px-3 py-2 align-top text-muted-foreground">
                {formatValue(left.payload[field.key], locale)}
              </td>
              <td className="px-3 py-2 align-top">
                {formatValue(right.payload[field.key], locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(value: unknown, locale: 'en' | 'ro'): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean')
    return value ? (locale === 'ro' ? 'Da' : 'Yes') : locale === 'ro' ? 'Nu' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    if (value.every((row) => typeof row === 'object' && row !== null)) {
      return value
        .map(
          (row, index) =>
            `${index + 1}. ${Object.values(row as Record<string, unknown>).join(' · ')}`,
        )
        .join('\n');
    }
    return value.join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isVisible(
  field: DocumentDetail['template']['sections'][number]['fields'][number],
  payload: DocumentPayload,
): boolean {
  const condition = field.conditional;
  if (!condition) return true;
  const value = payload[condition.field];
  if (
    condition.equals !== undefined &&
    JSON.stringify(value) !== JSON.stringify(condition.equals)
  ) {
    return false;
  }
  if (
    condition.notEquals !== undefined &&
    JSON.stringify(value) === JSON.stringify(condition.notEquals)
  ) {
    return false;
  }
  if (
    condition.in &&
    !condition.in.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))
  ) {
    return false;
  }
  return true;
}

function bumpVersion(label: string): string {
  const match = /^(\d+)\.(\d+)$/.exec(label);
  if (!match) return '1.0';
  return `${match[1]}.${Number(match[2]) + 1}`;
}
