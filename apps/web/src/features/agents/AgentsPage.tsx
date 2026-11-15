import {
  Bot,
  CheckCircle2,
  Copy,
  Download,
  FileDiff,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AgentDownloadPlatform,
  AgentEnrollmentResponse,
  AgentScanSummary,
  AgentSummary,
  NetworkAuditSummary,
  ScanDiffSummary,
} from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/features/auth/auth-context';
import { agentsApi, ApiClientError, networkApi } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import { formatDateTime } from '@/lib/format';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const statusVariant = {
  PENDING: 'warning',
  ACTIVE: 'success',
  REVOKED: 'neutral',
} as const;

const scanVariant = {
  QUEUED: 'neutral',
  RUNNING: 'primary',
  COMPLETED: 'success',
  FAILED: 'danger',
} as const;

export function AgentsPage() {
  const { t, i18n } = useTranslation();
  const { activeOrganization, activeOrganizationId } = useAuth();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [scans, setScans] = useState<AgentScanSummary[]>([]);
  const [audits, setAudits] = useState<NetworkAuditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [scanAgent, setScanAgent] = useState<AgentSummary | null>(null);
  const [diffScan, setDiffScan] = useState<AgentScanSummary | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!activeOrganizationId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const [nextAgents, nextScans, nextAudits] = await Promise.all([
          agentsApi.list(),
          agentsApi.scans(),
          networkApi.list().catch(() => []),
        ]);
        setAgents(nextAgents);
        setScans(nextScans);
        setAudits(nextAudits);
        setError(null);
      } catch (caught) {
        setError(caught instanceof ApiClientError ? caught.message : t('agents.loadError'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [activeOrganizationId, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeOrganizationId) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [activeOrganizationId, load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const revoke = async (agent: AgentSummary) => {
    if (!window.confirm(t('agents.revokeConfirm', { name: agent.name }))) return;
    try {
      await agentsApi.revoke(agent.id);
      setNotice(t('agents.revoked'));
      await load(true);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('agents.revokeError'));
    }
  };

  if (!activeOrganizationId || !activeOrganization) {
    return (
      <div className="container space-y-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{t('agents.title')}</h1>
        <Alert variant="info">{t('agents.noOrganization')}</Alert>
      </div>
    );
  }

  return (
    <div className="container space-y-6 py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{activeOrganization.name}</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Bot className="h-7 w-7 text-primary-600" aria-hidden="true" />
            {t('agents.title')}
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{t('agents.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowDownload(true)}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('agents.downloadAgent')}
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('agents.refresh')}
          </Button>
          <Button onClick={() => setShowEnrollment(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('agents.createEnrollment')}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <Alert variant="info">{t('agents.safety')}</Alert>

      {loading && agents.length === 0 ? (
        <Alert role="status">{t('agents.loading')}</Alert>
      ) : agents.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('agents.emptyTitle')}</CardTitle>
            <CardDescription>{t('agents.emptySubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setShowEnrollment(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('agents.createEnrollment')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="h-4 w-4 text-primary-600" aria-hidden="true" />
                    {agent.name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {agent.platform ?? t('agents.unknownPlatform')}
                    {agent.version ? ` · v${agent.version}` : ''}
                  </CardDescription>
                </div>
                <Badge variant={statusVariant[agent.status]}>
                  {t(`agents.status.${agent.status}`)}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{t('agents.lastSeen')}</dt>
                  <dd>
                    {agent.lastSeenAt ? formatDateTime(agent.lastSeenAt, i18n.language) : '—'}
                  </dd>
                  <dt className="text-muted-foreground">{t('agents.lastScan')}</dt>
                  <dd>
                    {agent.lastScanAt ? formatDateTime(agent.lastScanAt, i18n.language) : '—'}
                  </dd>
                  <dt className="text-muted-foreground">{t('agents.queuedScans')}</dt>
                  <dd>{agent.queuedScans}</dd>
                  {agent.enrollmentExpiresAt && agent.status === 'PENDING' ? (
                    <>
                      <dt className="text-muted-foreground">{t('agents.tokenExpires')}</dt>
                      <dd>{formatDateTime(agent.enrollmentExpiresAt, i18n.language)}</dd>
                    </>
                  ) : null}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => setScanAgent(agent)}
                    disabled={agent.status !== 'ACTIVE' || agent.queuedScans > 0}
                  >
                    <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('agents.requestScan')}
                  </Button>
                  {agent.status !== 'REVOKED' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-danger-600"
                      onClick={() => void revoke(agent)}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('agents.revoke')}
                    </Button>
                  ) : null}
                </div>
                {agent.status === 'PENDING' ? (
                  <p className="text-xs text-muted-foreground">{t('agents.pendingHint')}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('agents.scansTitle')}</CardTitle>
          <CardDescription>{t('agents.scansSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {scans.length === 0 ? (
            <Alert variant="info">{t('agents.scansEmpty')}</Alert>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">{t('agents.table.status')}</th>
                    <th className="px-2 py-2 font-medium">{t('agents.table.agent')}</th>
                    <th className="px-2 py-2 font-medium">{t('agents.table.audit')}</th>
                    <th className="px-2 py-2 font-medium">{t('agents.table.created')}</th>
                    <th className="px-2 py-2 font-medium">{t('agents.table.result')}</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan) => (
                    <tr key={scan.id} className="border-b border-border/70 last:border-0">
                      <td className="px-2 py-2">
                        <Badge variant={scanVariant[scan.status]}>
                          {t(`agents.scanStatus.${scan.status}`)}
                        </Badge>
                      </td>
                      <td className="px-2 py-2">{scan.agentName ?? '—'}</td>
                      <td className="px-2 py-2">{scan.auditName ?? '—'}</td>
                      <td className="px-2 py-2">{formatDateTime(scan.createdAt, i18n.language)}</td>
                      <td className="px-2 py-2">
                        {scan.resultSummary ? (
                          <span className="flex flex-wrap gap-x-2 text-xs">
                            <span className="text-primary-700 dark:text-primary-200">
                              +{scan.resultSummary.created}
                            </span>
                            <span className="text-warning-700 dark:text-warning-200">
                              ~{scan.resultSummary.changed}
                            </span>
                            <span className="text-danger-600">−{scan.resultSummary.missing}</span>
                          </span>
                        ) : scan.errorMessage ? (
                          <span className="text-xs text-danger-600">{scan.errorMessage}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {scan.resultSummary ? (
                          <Button variant="outline" size="sm" onClick={() => setDiffScan(scan)}>
                            <FileDiff className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t('agents.viewDiff')}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DownloadAgentDialog open={showDownload} onClose={() => setShowDownload(false)} />
      <EnrollmentDialog
        open={showEnrollment}
        onClose={() => setShowEnrollment(false)}
        onCreated={() => {
          setNotice(t('agents.enrollmentCreated'));
          void load(true);
        }}
      />
      <ScanDialog
        agent={scanAgent}
        audits={audits}
        onClose={() => setScanAgent(null)}
        onCreated={() => {
          setNotice(t('agents.scanQueued'));
          setScanAgent(null);
          void load(true);
        }}
      />
      <DiffDialog scan={diffScan} onClose={() => setDiffScan(null)} />
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-xl border border-border bg-background shadow-2xl ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border p-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('actions.close')}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const AGENT_PLATFORMS: Array<{
  id: AgentDownloadPlatform;
  filename: string;
  labelKey:
    | 'agents.platforms.linuxAmd64'
    | 'agents.platforms.linuxArm64'
    | 'agents.platforms.windowsAmd64'
    | 'agents.platforms.darwinAmd64'
    | 'agents.platforms.darwinArm64';
}> = [
  {
    id: 'linux-amd64',
    filename: 'nis2-scanner-agent-linux-amd64',
    labelKey: 'agents.platforms.linuxAmd64',
  },
  {
    id: 'linux-arm64',
    filename: 'nis2-scanner-agent-linux-arm64',
    labelKey: 'agents.platforms.linuxArm64',
  },
  {
    id: 'windows-amd64',
    filename: 'nis2-scanner-agent-windows-amd64.exe',
    labelKey: 'agents.platforms.windowsAmd64',
  },
  {
    id: 'darwin-amd64',
    filename: 'nis2-scanner-agent-darwin-amd64',
    labelKey: 'agents.platforms.darwinAmd64',
  },
  {
    id: 'darwin-arm64',
    filename: 'nis2-scanner-agent-darwin-arm64',
    labelKey: 'agents.platforms.darwinArm64',
  },
];

function DownloadAgentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<AgentDownloadPlatform | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const download = async (platform: (typeof AGENT_PLATFORMS)[number]) => {
    setBusy(platform.id);
    setError(null);
    try {
      const blob = await agentsApi.download(platform.id);
      downloadBlob(blob, platform.filename);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('agents.downloadError'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title={t('agents.downloadTitle')} onClose={onClose} wide>
      <div className="space-y-4">
        <Alert variant="info">{t('agents.downloadHelp')}</Alert>
        <div className="grid gap-2 sm:grid-cols-2">
          {AGENT_PLATFORMS.map((platform) => (
            <Button
              key={platform.id}
              variant="outline"
              className="justify-start"
              disabled={busy !== null}
              onClick={() => void download(platform)}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {busy === platform.id ? t('agents.downloading') : t(platform.labelKey)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('agents.downloadNote')}</p>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t('actions.close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EnrollmentDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('Office scanner');
  const [expires, setExpires] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentEnrollmentResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('Office scanner');
      setExpires(60);
      setResult(null);
      setError(null);
      setCopied(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await agentsApi.createEnrollment({ name, expiresInMinutes: expires }));
      onCreated();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('agents.enrollmentError'));
    } finally {
      setBusy(false);
    }
  };

  const server = typeof window === 'undefined' ? '' : window.location.origin;
  const command = result
    ? `nis2-scanner-agent --server ${server} --enrollment-token ${result.token} --i-authorize-scanning`
    : '';

  return (
    <Modal title={t('agents.createEnrollment')} onClose={onClose} wide={Boolean(result)}>
      {result ? (
        <div className="space-y-4">
          <Alert variant="warning">{t('agents.tokenShownOnce')}</Alert>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('agents.token')}</p>
            <code className="block break-all rounded-md border border-border bg-muted p-3 text-xs">
              {result.token}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(result.token).then(() => setCopied(true));
              }}
            >
              <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {copied ? t('agents.copied') : t('agents.copyToken')}
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('agents.runCommand')}</p>
            <code className="block break-all rounded-md border border-border bg-neutral-950 p-3 text-xs text-neutral-100">
              {command}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard?.writeText(command)}
            >
              <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('agents.copyCommand')}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>{t('actions.close')}</Button>
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <Alert variant="info">{t('agents.enrollmentHelp')}</Alert>
          <Field id="agent-name" label={t('agents.name')}>
            <Input
              id="agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
          <Field id="agent-expiry" label={t('agents.tokenValidity')}>
            <select
              id="agent-expiry"
              className={selectClass}
              value={expires}
              onChange={(event) => setExpires(Number(event.target.value))}
            >
              <option value={15}>{t('agents.minutes', { count: 15 })}</option>
              <option value={60}>{t('agents.minutes', { count: 60 })}</option>
              <option value={240}>{t('agents.hours', { count: 4 })}</option>
              <option value={1440}>{t('agents.hours', { count: 24 })}</option>
            </select>
          </Field>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? t('actions.saving') : t('agents.generateToken')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ScanDialog({
  agent,
  audits,
  onClose,
  onCreated,
}: {
  agent: AgentSummary | null;
  audits: NetworkAuditSummary[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [auditId, setAuditId] = useState('');
  const [cidrs, setCidrs] = useState('');
  const [topPorts, setTopPorts] = useState(100);
  const [rate, setRate] = useState(20);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agent) return;
    setAuditId(audits[0]?.id ?? '');
    setCidrs('');
    setTopPorts(100);
    setRate(20);
    setConsent(false);
    setError(null);
  }, [agent, audits]);

  if (!agent) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!auditId || !consent) return;
    setBusy(true);
    setError(null);
    try {
      await agentsApi.createScan(agent.id, {
        auditId,
        cidrs: cidrs
          .split(/[\s,]+/)
          .map((value) => value.trim())
          .filter(Boolean),
        topPorts,
        enableMdns: false,
        enableNetbios: false,
        rateLimitPerSecond: rate,
        authorized: true,
      });
      onCreated();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('agents.scanError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('agents.requestScan')} onClose={onClose}>
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <Alert variant="info">{t('agents.scanHelp')}</Alert>
        {audits.length === 0 ? <Alert variant="warning">{t('agents.noAudits')}</Alert> : null}
        <Field id="scan-audit" label={t('agents.audit')}>
          <select
            id="scan-audit"
            className={selectClass}
            value={auditId}
            onChange={(event) => setAuditId(event.target.value)}
          >
            {audits.map((audit) => (
              <option key={audit.id} value={audit.id}>
                {audit.name} · {audit.period}
              </option>
            ))}
          </select>
        </Field>
        <Field id="scan-cidrs" label={t('agents.cidrs')} hint={t('agents.cidrsHint')}>
          <Input
            id="scan-cidrs"
            placeholder="192.168.1.0/24"
            value={cidrs}
            onChange={(event) => setCidrs(event.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="scan-top-ports" label={t('agents.topPorts')}>
            <Input
              id="scan-top-ports"
              type="number"
              min={0}
              max={1000}
              value={topPorts}
              onChange={(event) => setTopPorts(Number(event.target.value))}
            />
          </Field>
          <Field id="scan-rate" label={t('agents.rate')}>
            <Input
              id="scan-rate"
              type="number"
              min={1}
              max={500}
              value={rate}
              onChange={(event) => setRate(Number(event.target.value))}
            />
          </Field>
        </div>
        <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary-600"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>{t('agents.consent')}</span>
        </label>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={busy || !auditId || !consent}>
            {busy ? t('agents.queueing') : t('agents.queueScan')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DiffDialog({ scan, onClose }: { scan: AgentScanSummary | null; onClose: () => void }) {
  const { t } = useTranslation();
  if (!scan?.resultSummary) return null;
  const summary: ScanDiffSummary = scan.resultSummary;
  return (
    <Modal title={t('agents.diffTitle')} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DiffStat label={t('agents.diff.created')} value={summary.created} tone="primary" />
          <DiffStat label={t('agents.diff.changed')} value={summary.changed} tone="warning" />
          <DiffStat label={t('agents.diff.missing')} value={summary.missing} tone="danger" />
          <DiffStat label={t('agents.diff.unchanged')} value={summary.unchanged} tone="neutral" />
        </div>
        <DiffList title={t('agents.diff.newDevices')} devices={summary.newDevices} />
        <DiffList
          title={t('agents.diff.changedDevices')}
          devices={summary.changedDevices}
          showChanges
        />
        <DiffList title={t('agents.diff.missingDevices')} devices={summary.missingDevices} />
        <div className="flex justify-end">
          <Button onClick={onClose}>{t('actions.close')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function DiffStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'primary' | 'warning' | 'danger' | 'neutral';
}) {
  const classes = {
    primary:
      'border-primary-200 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-200',
    warning:
      'border-warning-200 bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-100',
    danger:
      'border-danger-200 bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-100',
    neutral: 'border-border bg-muted text-foreground',
  };
  return (
    <div className={`rounded-lg border p-3 ${classes[tone]}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function DiffList({
  title,
  devices,
  showChanges = false,
}: {
  title: string;
  devices: Array<{ id: string; name: string; ipAddresses: string[]; changes?: string[] }>;
  showChanges?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <CheckCircle2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {title} ({devices.length})
      </h3>
      {devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('agents.diff.none')}</p>
      ) : (
        <ul className="space-y-1 rounded-md border border-border p-3 text-sm">
          {devices.map((device) => (
            <li key={device.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{device.name}</span>
              <span className="text-muted-foreground">{device.ipAddresses.join(', ') || '—'}</span>
              {showChanges && device.changes && device.changes.length > 0 ? (
                <span className="text-xs text-muted-foreground">({device.changes.join(', ')})</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
