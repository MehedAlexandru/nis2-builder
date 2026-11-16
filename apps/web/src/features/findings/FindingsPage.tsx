import { ClipboardList, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  FINDING_CATEGORY_LABEL,
  type CreateFindingInput,
  type FindingCategory,
  type FindingDetail,
  type FindingList,
  type FindingStatus,
  type FindingSuggestion,
  type NetworkAuditSummary,
  type NetworkMap,
  type Severity,
  type UpdateFindingInput,
} from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Badge, SeverityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/features/auth/auth-context';
import { ApiClientError, findingsApi, networkApi } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const textareaClass =
  'flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const STATUSES: FindingStatus[] = ['OPEN', 'IN_PROGRESS', 'MITIGATED', 'ACCEPTED_RISK', 'CLOSED'];
const SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SEVERITY_KEY: Record<
  Severity,
  'severity.low' | 'severity.medium' | 'severity.high' | 'severity.critical'
> = {
  LOW: 'severity.low',
  MEDIUM: 'severity.medium',
  HIGH: 'severity.high',
  CRITICAL: 'severity.critical',
};
const CATEGORIES = Object.keys(FINDING_CATEGORY_LABEL) as FindingCategory[];

interface FindingFormState {
  title: string;
  description: string;
  category: FindingCategory;
  severity: Severity;
  status: FindingStatus;
  likelihood: string;
  impact: string;
  organizationWide: boolean;
  evidence: string;
  proposedSolution: string;
  effort: '' | 'S' | 'M' | 'L';
  costEstimateEur: string;
  ownerUserId: string;
  dueDate: string;
  auditId: string;
  deviceIds: string[];
  riskJustification: string;
  riskApprover: string;
  note: string;
}

function emptyForm(auditId: string | null, deviceId?: string | null): FindingFormState {
  return {
    title: '',
    description: '',
    category: 'OTHER',
    severity: 'MEDIUM',
    status: 'OPEN',
    likelihood: '',
    impact: '',
    organizationWide: false,
    evidence: '',
    proposedSolution: '',
    effort: '',
    costEstimateEur: '',
    ownerUserId: '',
    dueDate: '',
    auditId: auditId ?? '',
    deviceIds: deviceId ? [deviceId] : [],
    riskJustification: '',
    riskApprover: '',
    note: '',
  };
}

function formFromDetail(finding: FindingDetail): FindingFormState {
  return {
    title: finding.title,
    description: finding.description ?? '',
    category: finding.category,
    severity: finding.severity,
    status: finding.status,
    likelihood: finding.likelihood ? String(finding.likelihood) : '',
    impact: finding.impact ? String(finding.impact) : '',
    organizationWide: finding.organizationWide,
    evidence: finding.evidence ?? '',
    proposedSolution: finding.proposedSolution ?? '',
    effort: finding.effort ?? '',
    costEstimateEur: finding.costEstimateEur ? String(finding.costEstimateEur) : '',
    ownerUserId: finding.ownerUserId ?? '',
    dueDate: finding.dueDate ? finding.dueDate.slice(0, 10) : '',
    auditId: finding.auditId ?? '',
    deviceIds: finding.devices.map((device) => device.id),
    riskJustification: finding.riskAcceptance?.justification ?? '',
    riskApprover: finding.riskAcceptance?.approverName ?? '',
    note: '',
  };
}

function toCreateInput(form: FindingFormState): CreateFindingInput {
  const input: CreateFindingInput = {
    title: form.title.trim(),
    description: form.description.trim() || null,
    category: form.category,
    severity: form.severity,
    status: form.status,
    likelihood: form.likelihood ? Number(form.likelihood) : null,
    impact: form.impact ? Number(form.impact) : null,
    organizationWide: form.organizationWide,
    evidence: form.evidence.trim() || null,
    proposedSolution: form.proposedSolution.trim() || null,
    effort: form.effort || null,
    costEstimateEur: form.costEstimateEur ? Number(form.costEstimateEur) : null,
    ownerUserId: form.ownerUserId || null,
    dueDate: form.dueDate || null,
    auditId: form.auditId || null,
    deviceIds: form.organizationWide ? [] : form.deviceIds,
  };
  if (form.status === 'ACCEPTED_RISK') {
    input.riskAcceptance = {
      justification: form.riskJustification.trim(),
      approverName: form.riskApprover.trim(),
    };
  }
  return input;
}

function toUpdateInput(form: FindingFormState): UpdateFindingInput {
  return {
    ...toCreateInput(form),
    note: form.note.trim() || null,
  };
}

export function FindingsPage() {
  const { t, i18n } = useTranslation();
  const { user, activeOrganization, activeOrganizationId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const auditParam = searchParams.get('audit');
  const deviceParam = searchParams.get('device');
  const [audits, setAudits] = useState<NetworkAuditSummary[]>([]);
  const [map, setMap] = useState<NetworkMap | null>(null);
  const [list, setList] = useState<FindingList | null>(null);
  const [suggestions, setSuggestions] = useState<FindingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FindingDetail | null>(null);
  const [detail, setDetail] = useState<FindingDetail | null>(null);
  const [form, setForm] = useState<FindingFormState>(() => emptyForm(auditParam, deviceParam));
  const [saving, setSaving] = useState(false);
  const [suggestionBusy, setSuggestionBusy] = useState<string | null>(null);

  const selectedAuditId = useMemo(
    () =>
      auditParam && audits.some((audit) => audit.id === auditParam)
        ? auditParam
        : (audits[0]?.id ?? null),
    [auditParam, audits],
  );
  const selectedAudit = audits.find((audit) => audit.id === selectedAuditId) ?? null;

  const load = useCallback(
    async (silent = false) => {
      if (!activeOrganizationId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const nextAudits = await networkApi.list();
        setAudits(nextAudits);
        const auditId = selectedAuditId ?? nextAudits[0]?.id ?? null;
        const [nextList, nextMap, nextSuggestions] = await Promise.all([
          findingsApi.list({
            ...(auditId ? { auditId } : {}),
            ...(statusFilter ? { status: statusFilter as FindingStatus } : {}),
            ...(severityFilter ? { severity: severityFilter as Severity } : {}),
            ...(search ? { q: search } : {}),
          }),
          auditId ? networkApi.map(auditId) : Promise.resolve(null),
          auditId
            ? findingsApi.suggestions(auditId).catch(() => ({ items: [], dismissed: 0 }))
            : Promise.resolve({ items: [], dismissed: 0 }),
        ]);
        setList(nextList);
        setMap(nextMap);
        setSuggestions(nextSuggestions.items);
        setError(null);
      } catch (caught) {
        setError(caught instanceof ApiClientError ? caught.message : t('findings.loadError'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [activeOrganizationId, search, selectedAuditId, severityFilter, statusFilter, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (deviceParam && map) {
      setForm(emptyForm(selectedAuditId, deviceParam));
      setShowForm(true);
    }
  }, [deviceParam, map, selectedAuditId]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(selectedAuditId));
    setShowForm(true);
  };

  const openEdit = async (finding: FindingDetail) => {
    try {
      const detail = await findingsApi.get(finding.id);
      setEditing(detail);
      setForm(formFromDetail(detail));
      setDetail(null);
      setShowForm(true);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('findings.loadError'));
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await findingsApi.update(editing.id, toUpdateInput(form));
        setNotice(t('findings.updated'));
      } else {
        await findingsApi.create(toCreateInput(form));
        setNotice(t('findings.created'));
      }
      setShowForm(false);
      setEditing(null);
      setDetail(null);
      setSearchParams(selectedAuditId ? { audit: selectedAuditId } : {}, { replace: true });
      await load(true);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('findings.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (finding: FindingDetail) => {
    if (!window.confirm(t('findings.deleteConfirm', { title: finding.title }))) return;
    try {
      await findingsApi.remove(finding.id);
      setDetail(null);
      setNotice(t('findings.deleted'));
      await load(true);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('findings.deleteError'));
    }
  };

  const confirmSuggestion = async (suggestion: FindingSuggestion) => {
    setSuggestionBusy(suggestion.key);
    try {
      await findingsApi.confirmSuggestion({
        deviceId: suggestion.deviceId,
        riskCode: suggestion.riskCode,
      });
      setNotice(t('findings.suggestionConfirmed'));
      await load(true);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('findings.suggestionError'));
    } finally {
      setSuggestionBusy(null);
    }
  };

  const dismissSuggestion = async (suggestion: FindingSuggestion) => {
    setSuggestionBusy(suggestion.key);
    try {
      await findingsApi.dismissSuggestion({
        deviceId: suggestion.deviceId,
        riskCode: suggestion.riskCode,
      });
      setSuggestions((current) => current.filter((entry) => entry.key !== suggestion.key));
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('findings.suggestionError'));
    } finally {
      setSuggestionBusy(null);
    }
  };

  if (!activeOrganizationId || !activeOrganization) {
    return (
      <div className="container space-y-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{t('findings.title')}</h1>
        <Alert variant="info">{t('findings.noOrganization')}</Alert>
      </div>
    );
  }

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{activeOrganization.name}</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ClipboardList className="h-7 w-7 text-primary-600" aria-hidden="true" />
            {t('findings.title')}
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{t('findings.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('findings.refresh')}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('findings.newFinding')}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label={t('findings.metrics.total')} value={list?.counts.total ?? 0} />
        <Metric label={t('findings.metrics.open')} value={list?.counts.open ?? 0} tone="warning" />
        <Metric
          label={t('findings.metrics.critical')}
          value={list?.counts.bySeverity.CRITICAL ?? 0}
          tone="danger"
        />
        <Metric
          label={t('findings.metrics.high')}
          value={list?.counts.bySeverity.HIGH ?? 0}
          tone="warning"
        />
        <Metric
          label={t('findings.metrics.overdue')}
          value={list?.counts.overdue ?? 0}
          tone="danger"
        />
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
          <Field id="findings-audit" label={t('findings.audit')}>
            <select
              id="findings-audit"
              className={selectClass}
              value={selectedAuditId ?? ''}
              onChange={(event) => {
                setSearchParams({ audit: event.target.value });
              }}
            >
              {audits.map((audit) => (
                <option key={audit.id} value={audit.id}>
                  {audit.name} ({audit.period})
                </option>
              ))}
            </select>
          </Field>
          <Field id="findings-status" label={t('findings.statusLabel')}>
            <select
              id="findings-status"
              className={selectClass}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">{t('findings.allStatuses')}</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`findings.status.${status}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="findings-severity" label={t('findings.severityLabel')}>
            <select
              id="findings-severity"
              className={selectClass}
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
            >
              <option value="">{t('findings.allSeverities')}</option>
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {t(SEVERITY_KEY[severity])}
                </option>
              ))}
            </select>
          </Field>
          <Field id="findings-search" label={t('findings.search')}>
            <Input
              id="findings-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('findings.searchPlaceholder')}
            />
          </Field>
        </CardContent>
      </Card>

      {selectedAuditId ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary-600" aria-hidden="true" />
                {t('findings.suggestionsTitle')}
              </CardTitle>
              <CardDescription>
                {t('findings.suggestionsSubtitle', { audit: selectedAudit?.name ?? '' })}
              </CardDescription>
            </div>
            <Badge variant="primary">{suggestions.length}</Badge>
          </CardHeader>
          <CardContent>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('findings.suggestionsEmpty')}</p>
            ) : (
              <div className="space-y-3">
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.key}
                    className="flex flex-col gap-3 rounded-lg border border-border p-4 lg:flex-row lg:items-start lg:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge
                          severity={suggestion.severity}
                          label={t(SEVERITY_KEY[suggestion.severity])}
                        />
                        <span className="text-sm font-semibold">{suggestion.title}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{suggestion.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {suggestion.deviceName} · {suggestion.legalReference} ·{' '}
                        {t(`findings.categories.${suggestion.category}`)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        disabled={suggestionBusy === suggestion.key}
                        onClick={() => void confirmSuggestion(suggestion)}
                      >
                        {t('findings.confirmSuggestion')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={suggestionBusy === suggestion.key}
                        onClick={() => void dismissSuggestion(suggestion)}
                      >
                        {t('findings.dismissSuggestion')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('findings.registerTitle')}</CardTitle>
          <CardDescription>{t('findings.registerSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !list ? (
            <Alert role="status">{t('findings.loading')}</Alert>
          ) : !list || list.items.length === 0 ? (
            <div className="space-y-3">
              <Alert variant="info">{t('findings.empty')}</Alert>
              <Button onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('findings.newFinding')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">{t('findings.table.code')}</th>
                    <th className="px-2 py-2 font-medium">{t('findings.table.title')}</th>
                    <th className="px-2 py-2 font-medium">{t('findings.table.severity')}</th>
                    <th className="px-2 py-2 font-medium">{t('findings.table.status')}</th>
                    <th className="px-2 py-2 font-medium">{t('findings.table.devices')}</th>
                    <th className="px-2 py-2 font-medium">{t('findings.table.owner')}</th>
                    <th className="px-2 py-2 font-medium">{t('findings.table.due')}</th>
                    <th className="px-2 py-2 font-medium">{t('findings.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((finding) => (
                    <tr key={finding.id} className="border-b border-border last:border-0">
                      <td className="px-2 py-3 font-mono text-xs">{finding.code ?? '—'}</td>
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          className="text-left font-medium hover:text-primary-700"
                          onClick={() => {
                            void findingsApi
                              .get(finding.id)
                              .then(setDetail)
                              .catch((caught: unknown) =>
                                setError(
                                  caught instanceof ApiClientError
                                    ? caught.message
                                    : t('findings.loadError'),
                                ),
                              );
                          }}
                        >
                          {finding.title}
                        </button>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t(`findings.categories.${finding.category}`)}
                          {finding.auditName ? ` · ${finding.auditName}` : ''}
                        </p>
                      </td>
                      <td className="px-2 py-3">
                        <SeverityBadge
                          severity={finding.severity}
                          label={t(SEVERITY_KEY[finding.severity])}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <Badge variant={statusVariant(finding.status)}>
                          {t(`findings.status.${finding.status}`)}
                        </Badge>
                      </td>
                      <td className="px-2 py-3">{finding.deviceCount}</td>
                      <td className="px-2 py-3">{finding.ownerName ?? '—'}</td>
                      <td className="px-2 py-3">
                        {finding.dueDate ? formatDate(finding.dueDate, i18n.language) : '—'}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('findings.edit')}
                            onClick={() => {
                              void findingsApi.get(finding.id).then(openEdit);
                            }}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger-600"
                            aria-label={t('actions.delete')}
                            onClick={() => {
                              void findingsApi.get(finding.id).then(remove);
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showForm ? (
        <Modal
          title={editing ? t('findings.editTitle') : t('findings.createTitle')}
          onClose={() => setShowForm(false)}
          wide
        >
          <form className="space-y-4 p-5" onSubmit={(event) => void save(event)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="finding-title" label={t('findings.form.title')}>
                <Input
                  id="finding-title"
                  required
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </Field>
              <Field id="finding-audit" label={t('findings.form.audit')}>
                <select
                  id="finding-audit"
                  className={selectClass}
                  value={form.auditId}
                  onChange={(event) => setForm({ ...form, auditId: event.target.value })}
                >
                  <option value="">{t('findings.form.organizationOnly')}</option>
                  {audits.map((audit) => (
                    <option key={audit.id} value={audit.id}>
                      {audit.name} ({audit.period})
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="finding-category" label={t('findings.form.category')}>
                <select
                  id="finding-category"
                  className={selectClass}
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value as FindingCategory })
                  }
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {t(`findings.categories.${category}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="finding-severity" label={t('findings.form.severity')}>
                <select
                  id="finding-severity"
                  className={selectClass}
                  value={form.severity}
                  onChange={(event) =>
                    setForm({ ...form, severity: event.target.value as Severity })
                  }
                >
                  {SEVERITIES.map((severity) => (
                    <option key={severity} value={severity}>
                      {t(SEVERITY_KEY[severity])}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="finding-status" label={t('findings.form.status')}>
                <select
                  id="finding-status"
                  className={selectClass}
                  value={form.status}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value as FindingStatus })
                  }
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(`findings.status.${status}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="finding-due" label={t('findings.form.dueDate')}>
                <Input
                  id="finding-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                />
              </Field>
              <Field id="finding-likelihood" label={t('findings.form.likelihood')}>
                <Input
                  id="finding-likelihood"
                  type="number"
                  min="1"
                  max="5"
                  value={form.likelihood}
                  onChange={(event) => setForm({ ...form, likelihood: event.target.value })}
                />
              </Field>
              <Field id="finding-impact" label={t('findings.form.impact')}>
                <Input
                  id="finding-impact"
                  type="number"
                  min="1"
                  max="5"
                  value={form.impact}
                  onChange={(event) => setForm({ ...form, impact: event.target.value })}
                />
              </Field>
              <Field id="finding-owner" label={t('findings.form.owner')}>
                <select
                  id="finding-owner"
                  className={selectClass}
                  value={form.ownerUserId}
                  onChange={(event) => setForm({ ...form, ownerUserId: event.target.value })}
                >
                  <option value="">{t('findings.form.unassigned')}</option>
                  {user ? (
                    <option value={user.id}>
                      {user.givenName} {user.familyName}
                    </option>
                  ) : null}
                </select>
              </Field>
              <Field id="finding-effort" label={t('findings.form.effort')}>
                <select
                  id="finding-effort"
                  className={selectClass}
                  value={form.effort}
                  onChange={(event) =>
                    setForm({ ...form, effort: event.target.value as FindingFormState['effort'] })
                  }
                >
                  <option value="">—</option>
                  <option value="S">{t('findings.effort.S')}</option>
                  <option value="M">{t('findings.effort.M')}</option>
                  <option value="L">{t('findings.effort.L')}</option>
                </select>
              </Field>
              <Field id="finding-cost" label={t('findings.form.cost')}>
                <Input
                  id="finding-cost"
                  type="number"
                  min="0"
                  value={form.costEstimateEur}
                  onChange={(event) => setForm({ ...form, costEstimateEur: event.target.value })}
                />
              </Field>
            </div>
            <Field id="finding-description" label={t('findings.form.description')}>
              <textarea
                id="finding-description"
                className={textareaClass}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
            <Field id="finding-evidence" label={t('findings.form.evidence')}>
              <textarea
                id="finding-evidence"
                className={textareaClass}
                value={form.evidence}
                onChange={(event) => setForm({ ...form, evidence: event.target.value })}
              />
            </Field>
            <Field id="finding-solution" label={t('findings.form.proposedSolution')}>
              <textarea
                id="finding-solution"
                className={textareaClass}
                value={form.proposedSolution}
                onChange={(event) => setForm({ ...form, proposedSolution: event.target.value })}
              />
            </Field>
            <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary-600"
                checked={form.organizationWide}
                onChange={(event) =>
                  setForm({
                    ...form,
                    organizationWide: event.target.checked,
                    deviceIds: event.target.checked ? [] : form.deviceIds,
                  })
                }
              />
              <span>
                <span className="font-medium">{t('findings.form.organizationWide')}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t('findings.form.organizationWideHint')}
                </span>
              </span>
            </label>
            {!form.organizationWide ? (
              <Field id="finding-devices" label={t('findings.form.devices')}>
                <div
                  id="finding-devices"
                  className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2"
                >
                  {(map?.devices ?? []).map((device) => (
                    <label
                      key={device.id}
                      className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary-600"
                        checked={form.deviceIds.includes(device.id)}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            deviceIds: event.target.checked
                              ? [...form.deviceIds, device.id]
                              : form.deviceIds.filter((id) => id !== device.id),
                          })
                        }
                      />
                      <span>
                        {device.name}
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          · {device.ipAddresses[0] ?? device.type}
                        </span>
                      </span>
                    </label>
                  ))}
                  {(map?.devices.length ?? 0) === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">
                      {t('findings.form.noDevices')}
                    </p>
                  ) : null}
                </div>
              </Field>
            ) : null}
            {form.status === 'ACCEPTED_RISK' ? (
              <div className="grid gap-4 rounded-md border border-warning-500/40 bg-warning-50 p-3 sm:grid-cols-2 dark:bg-warning-500/10">
                <Field id="finding-risk-justification" label={t('findings.form.riskJustification')}>
                  <textarea
                    id="finding-risk-justification"
                    required
                    minLength={10}
                    className={textareaClass}
                    value={form.riskJustification}
                    onChange={(event) =>
                      setForm({ ...form, riskJustification: event.target.value })
                    }
                  />
                </Field>
                <Field id="finding-risk-approver" label={t('findings.form.riskApprover')}>
                  <Input
                    id="finding-risk-approver"
                    required
                    value={form.riskApprover}
                    onChange={(event) => setForm({ ...form, riskApprover: event.target.value })}
                  />
                </Field>
              </div>
            ) : null}
            {editing ? (
              <Field id="finding-note" label={t('findings.form.note')}>
                <Input
                  id="finding-note"
                  value={form.note}
                  onChange={(event) => setForm({ ...form, note: event.target.value })}
                />
              </Field>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t('actions.saving') : t('actions.save')}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {detail ? (
        <Modal title={detail.title} onClose={() => setDetail(null)} wide>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={detail.severity} label={t(SEVERITY_KEY[detail.severity])} />
              <Badge variant={statusVariant(detail.status)}>
                {t(`findings.status.${detail.status}`)}
              </Badge>
              <span className="text-xs text-muted-foreground">{detail.code ?? '—'}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {detail.description ?? t('findings.noDescription')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label={t('findings.form.category')}>
                {t(`findings.categories.${detail.category}`)}
              </DetailRow>
              <DetailRow label={t('findings.form.audit')}>
                {detail.auditName ?? t('findings.form.organizationOnly')}
              </DetailRow>
              <DetailRow label={t('findings.form.owner')}>{detail.ownerName ?? '—'}</DetailRow>
              <DetailRow label={t('findings.form.dueDate')}>
                {detail.dueDate ? formatDate(detail.dueDate, i18n.language) : '—'}
              </DetailRow>
              <DetailRow label={t('findings.form.riskScore')}>{detail.riskScore ?? '—'}</DetailRow>
              <DetailRow label={t('findings.form.devices')}>
                {detail.organizationWide
                  ? t('findings.form.organizationWide')
                  : detail.devices.map((device) => device.name).join(', ') || '—'}
              </DetailRow>
            </div>
            {detail.proposedSolution ? (
              <div>
                <p className="text-sm font-medium">{t('findings.form.proposedSolution')}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {detail.proposedSolution}
                </p>
              </div>
            ) : null}
            {detail.riskAcceptance ? (
              <Alert variant="warning" title={t('findings.riskAcceptedTitle')}>
                <p>{detail.riskAcceptance.justification}</p>
                <p className="mt-1 text-xs">
                  {detail.riskAcceptance.approverName} ·{' '}
                  {formatDateTime(
                    detail.riskAcceptance.acceptedAt ?? detail.updatedAt,
                    i18n.language,
                  )}
                </p>
              </Alert>
            ) : null}
            <div>
              <p className="text-sm font-medium">{t('findings.history')}</p>
              {detail.history.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">{t('findings.noHistory')}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {detail.history.map((entry) => (
                    <li key={entry.id} className="rounded-md border border-border p-3 text-sm">
                      <p className="font-medium">
                        {entry.changedByName ?? t('findings.unknownUser')} ·{' '}
                        {formatDateTime(entry.createdAt, i18n.language)}
                      </p>
                      {entry.note ? <p className="text-muted-foreground">{entry.note}</p> : null}
                      {entry.changes.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.changes
                            .map(
                              (change) =>
                                `${change.field}: ${change.from ?? '—'} → ${change.to ?? '—'}`,
                            )
                            .join(' · ')}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => void openEdit(detail)}>
                <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('findings.edit')}
              </Button>
              <Button
                variant="outline"
                className="text-danger-600"
                onClick={() => void remove(detail)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('actions.delete')}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function statusVariant(
  status: FindingStatus,
): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' {
  return status === 'CLOSED'
    ? 'success'
    : status === 'ACCEPTED_RISK'
      ? 'warning'
      : status === 'OPEN'
        ? 'danger'
        : 'primary';
}

function Metric({
  label,
  value,
  tone = 'primary',
}: {
  label: string;
  value: number;
  tone?: 'primary' | 'warning' | 'danger';
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p
          className={`mt-1 text-2xl font-bold ${
            tone === 'danger' ? 'text-danger-600' : tone === 'warning' ? 'text-warning-600' : ''
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-xl border border-border bg-background shadow-2xl ${
          wide ? 'max-w-4xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border p-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('actions.close')}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
