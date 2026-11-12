import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Files,
  GitMerge,
  Network as NetworkIcon,
  Pencil,
  Plus,
  RadioTower,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type {
  CreateNetworkAuditInput,
  DeviceImportFormat,
  DeviceImportResult,
  DeviceType,
  DuplicateDeviceGroup,
  NetworkAuditSummary,
  NetworkConnection,
  NetworkMap,
  NetworkZone,
  UpdateConnectionInput,
} from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Progress } from '@/components/ui/Progress';
import { useAuth } from '@/features/auth/auth-context';
import { ApiClientError, networkApi } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import { DevicePanel } from './DevicePanel';
import { DeviceTypeIcon } from './device-visuals';
import { NetworkCanvas } from './NetworkCanvas';

const DEVICE_TYPE_ORDER: DeviceType[] = [
  'ROUTER',
  'SWITCH',
  'FIREWALL',
  'SERVER',
  'WORKSTATION',
  'LAPTOP',
  'PRINTER',
  'IP_CAMERA',
  'NVR',
  'NAS',
  'ACCESS_POINT',
  'PHONE',
  'IOT',
  'CLOUD_SERVICE',
  'UNKNOWN',
];

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

export function NetworkPage() {
  const { t } = useTranslation();
  const { activeOrganization, activeOrganizationId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAuditId = searchParams.get('audit');
  const [audits, setAudits] = useState<NetworkAuditSummary[]>([]);
  const [map, setMap] = useState<NetworkMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<NetworkConnection | null>(null);
  const [selectedZone, setSelectedZone] = useState<NetworkZone | null>(null);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [showNewAudit, setShowNewAudit] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [addingType, setAddingType] = useState<DeviceType | null>(null);

  const loadAudits = useCallback(async () => {
    if (!activeOrganizationId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const list = await networkApi.list();
      setAudits(list);
      if (list.length === 0) {
        setMap(null);
        return;
      }
      const desired =
        selectedAuditId && list.some((audit) => audit.id === selectedAuditId)
          ? selectedAuditId
          : list[0]?.id;
      if (desired && desired !== selectedAuditId) {
        setSearchParams({ audit: desired }, { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('network.loadError'));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, selectedAuditId, setSearchParams, t]);

  const loadMap = useCallback(
    async (auditId: string, silent = false) => {
      if (!silent) setMapLoading(true);
      setError(null);
      try {
        const next = await networkApi.map(auditId);
        setMap(next);
        setSelectedConnection(null);
      } catch (caught) {
        setError(caught instanceof ApiClientError ? caught.message : t('network.loadError'));
      } finally {
        if (!silent) setMapLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadAudits();
  }, [loadAudits]);

  useEffect(() => {
    if (selectedAuditId) void loadMap(selectedAuditId);
  }, [loadMap, selectedAuditId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selectedDevice = useMemo(
    () => map?.devices.find((device) => device.id === selectedDeviceId) ?? null,
    [map, selectedDeviceId],
  );

  const refreshCurrent = async () => {
    if (selectedAuditId) await loadMap(selectedAuditId, true);
    await loadAudits();
  };

  const createAudit = async (input: CreateNetworkAuditInput) => {
    const created = await networkApi.create(input);
    setShowNewAudit(false);
    setAudits((current) => [created, ...current]);
    setSearchParams({ audit: created.id });
    setNotice(t('network.auditCreated'));
  };

  const addDevice = async (type: DeviceType) => {
    if (!selectedAuditId) return;
    setAddingType(type);
    setError(null);
    try {
      const created = await networkApi.createDevice(selectedAuditId, { type });
      setSelectedDeviceId(created.id);
      await refreshCurrent();
      setNotice(t('network.deviceAdded'));
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('network.device.addError'));
    } finally {
      setAddingType(null);
    }
  };

  const saveLayout = async (layout: Parameters<typeof networkApi.saveLayout>[1]) => {
    if (!selectedAuditId) return;
    await networkApi.saveLayout(selectedAuditId, layout);
    await loadMap(selectedAuditId, true);
  };

  const createConnection = async (sourceDeviceId: string, targetDeviceId: string) => {
    if (!selectedAuditId) return;
    await networkApi.createConnection(selectedAuditId, {
      sourceDeviceId,
      targetDeviceId,
      type: 'WIRED',
    });
    await loadMap(selectedAuditId, true);
    setNotice(t('network.connectionCreated'));
  };

  const importDevices = async (
    format: DeviceImportFormat,
    content: string,
  ): Promise<DeviceImportResult> => {
    if (!selectedAuditId) throw new Error('No audit selected');
    const result = await networkApi.importDevices(selectedAuditId, format, content);
    await refreshCurrent();
    setNotice(
      t('network.import.result', {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
      }),
    );
    return result;
  };

  const mergeGroup = async (group: DuplicateDeviceGroup, targetId: string) => {
    if (!selectedAuditId) return;
    for (const device of group.devices) {
      if (device.id === targetId) continue;
      await networkApi.merge(selectedAuditId, {
        sourceDeviceId: device.id,
        targetDeviceId: targetId,
      });
    }
  };

  const createZone = async (input: {
    name: string;
    color: string;
    description?: string;
    bounds: { x: number; y: number; width: number; height: number };
  }) => {
    if (!selectedAuditId) return;
    await networkApi.createZone(selectedAuditId, input);
    setZoneDialogOpen(false);
    await loadMap(selectedAuditId, true);
    setNotice(t('network.zone.created'));
  };

  const saveZone = async (
    zoneId: string,
    input: { name: string; color: string; description?: string | null },
  ) => {
    if (!selectedAuditId) return;
    await networkApi.updateZone(selectedAuditId, zoneId, input);
    setZoneDialogOpen(false);
    setSelectedZone(null);
    await loadMap(selectedAuditId, true);
    setNotice(t('network.zone.updated'));
  };

  const deleteZone = async (zoneId: string) => {
    if (!selectedAuditId) return;
    await networkApi.deleteZone(selectedAuditId, zoneId);
    setZoneDialogOpen(false);
    setSelectedZone(null);
    await loadMap(selectedAuditId, true);
    setNotice(t('network.zone.deleted'));
  };

  const downloadTemplate = async () => {
    try {
      const blob = await networkApi.importTemplate();
      downloadBlob(blob, 'nis2-device-import-template.csv');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : t('network.import.templateError'),
      );
    }
  };

  if (!activeOrganizationId || !activeOrganization) {
    return (
      <div className="container space-y-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{t('network.title')}</h1>
        <Alert variant="info">{t('network.noOrganization')}</Alert>
      </div>
    );
  }

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{activeOrganization.name}</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
            <NetworkIcon className="h-7 w-7 text-primary-600" aria-hidden="true" />
            {t('network.title')}
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{t('network.subtitle')}</p>
        </div>
        <Button onClick={() => setShowNewAudit(true)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('network.newAudit')}
        </Button>
      </div>

      {error ? (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      {loading ? (
        <Alert role="status">{t('network.loading')}</Alert>
      ) : audits.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('network.emptyTitle')}</CardTitle>
            <CardDescription>{t('network.emptySubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setShowNewAudit(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('network.createFirstAudit')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label={t('network.metrics.devices')}
              value={map?.audit.deviceCount ?? 0}
              icon={<RadioTower className="h-5 w-5" aria-hidden="true" />}
            />
            <MetricCard
              label={t('network.metrics.complete')}
              value={map?.audit.completeCount ?? 0}
              icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
              tone="success"
            />
            <MetricCard
              label={t('network.metrics.atRisk')}
              value={map?.audit.riskCount ?? 0}
              icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
              tone="warning"
            />
            <Card>
              <CardContent className="space-y-2 pt-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('network.metrics.average')}</span>
                  <span className="font-semibold">{map?.audit.averageCompleteness ?? 0}%</span>
                </div>
                <Progress
                  value={map?.audit.averageCompleteness ?? 0}
                  label={t('network.metrics.average')}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="text-sm font-medium" htmlFor="audit-select">
                    {t('network.audit')}
                  </label>
                  <select
                    id="audit-select"
                    className={`${selectClass} max-w-sm`}
                    value={selectedAuditId ?? ''}
                    onChange={(event) => {
                      setSelectedDeviceId(null);
                      setSearchParams({ audit: event.target.value });
                    }}
                  >
                    {audits.map((audit) => (
                      <option key={audit.id} value={audit.id}>
                        {audit.name} · {audit.period} · {audit.deviceCount}
                      </option>
                    ))}
                  </select>
                  {map ? (
                    <Badge variant={map.audit.status === 'CLOSED' ? 'success' : 'primary'}>
                      {t(`network.status.${map.audit.status}`)}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
                    <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('network.import.title')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowMerge(true)}>
                    <GitMerge className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('network.merge.title')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedZone(null);
                      setZoneDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('network.zone.add')}
                  </Button>
                  {selectedZone ? (
                    <Button variant="outline" size="sm" onClick={() => setZoneDialogOpen(true)}>
                      <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('network.zone.edit')}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{t('network.paletteTitle')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {DEVICE_TYPE_ORDER.map((type) => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      title={t(`network.types.${type}`)}
                      disabled={addingType !== null}
                      onClick={() => void addDevice(type)}
                    >
                      <DeviceTypeIcon type={type} className="h-4 w-4" />
                      <span className="ml-1 hidden 2xl:inline">{t(`network.types.${type}`)}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {mapLoading && !map ? (
            <Alert role="status">{t('network.mapLoading')}</Alert>
          ) : map ? (
            <NetworkCanvas
              map={map}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={(device) => {
                setSelectedDeviceId(device?.id ?? null);
                setSelectedConnection(null);
                if (device) {
                  setSelectedZone(null);
                  setZoneDialogOpen(false);
                }
              }}
              onSelectConnection={(connection) => {
                setSelectedConnection(connection);
                if (connection) {
                  setSelectedDeviceId(null);
                  setSelectedZone(null);
                  setZoneDialogOpen(false);
                }
              }}
              onSelectZone={(zone) => {
                setSelectedZone(zone);
                if (zone) {
                  setSelectedDeviceId(null);
                  setSelectedConnection(null);
                }
              }}
              onSaveLayout={saveLayout}
              onCreateConnection={createConnection}
              onError={setError}
            />
          ) : null}
        </>
      )}

      {selectedDevice && map ? (
        <DevicePanel
          auditId={map.audit.id}
          device={selectedDevice}
          zones={map.zones}
          onClose={() => setSelectedDeviceId(null)}
          onSaved={() => void refreshCurrent()}
          onDeleted={() => {
            setSelectedDeviceId(null);
            void refreshCurrent();
          }}
        />
      ) : null}

      {selectedConnection && map ? (
        <ConnectionDialog
          connection={selectedConnection}
          onClose={() => setSelectedConnection(null)}
          onSave={async (input) => {
            await networkApi.updateConnection(map.audit.id, selectedConnection.id, input);
            setSelectedConnection(null);
            await loadMap(map.audit.id, true);
            setNotice(t('network.connectionUpdated'));
          }}
          onDelete={async () => {
            await networkApi.deleteConnection(map.audit.id, selectedConnection.id);
            setSelectedConnection(null);
            await loadMap(map.audit.id, true);
            setNotice(t('network.connectionDeleted'));
          }}
        />
      ) : null}

      <ZoneDialog
        open={zoneDialogOpen}
        zone={selectedZone}
        nextIndex={map?.zones.length ?? 0}
        onClose={() => {
          setZoneDialogOpen(false);
          setSelectedZone(null);
        }}
        onCreate={createZone}
        onSave={saveZone}
        onDelete={deleteZone}
      />
      <NewAuditDialog
        open={showNewAudit}
        onClose={() => setShowNewAudit(false)}
        onSubmit={createAudit}
      />
      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={importDevices}
        onDownloadTemplate={downloadTemplate}
      />
      <MergeDialog
        open={showMerge}
        auditId={selectedAuditId}
        onClose={() => setShowMerge(false)}
        onMerge={mergeGroup}
        onCompleted={() => void refreshCurrent()}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: 'primary' | 'success' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success-600 bg-success-50 dark:bg-success-500/10'
      : tone === 'warning'
        ? 'text-warning-600 bg-warning-50 dark:bg-warning-500/10'
        : 'text-primary-600 bg-primary-50 dark:bg-primary-500/10';
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-6">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${toneClass}`}>{icon}</div>
      </CardContent>
    </Card>
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

function ZoneDialog({
  open,
  zone,
  nextIndex,
  onClose,
  onCreate,
  onSave,
  onDelete,
}: {
  open: boolean;
  zone: NetworkZone | null;
  nextIndex: number;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    color: string;
    description?: string;
    bounds: { x: number; y: number; width: number; height: number };
  }) => Promise<void>;
  onSave: (
    zoneId: string,
    input: { name: string; color: string; description?: string | null },
  ) => Promise<void>;
  onDelete: (zoneId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(zone?.name ?? '');
    setColor(zone?.color ?? '#2563EB');
    setDescription(zone?.description ?? '');
    setError(null);
  }, [open, zone]);

  if (!open) return null;

  const bounds = defaultZoneBounds(nextIndex);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(t('network.zone.nameRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (zone) {
        await onSave(zone.id, {
          name: name.trim(),
          color,
          description: description.trim() || null,
        });
      } else {
        await onCreate({
          name: name.trim(),
          color,
          ...(description.trim() ? { description: description.trim() } : {}),
          bounds,
        });
      }
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : t(zone ? 'network.zone.updateError' : 'network.zone.createError'),
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!zone || !window.confirm(t('network.zone.deleteConfirm', { name: zone.name }))) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(zone.id);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('network.zone.deleteError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t(zone ? 'network.zone.editTitle' : 'network.zone.createTitle')}
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <Field id="zone-name" label={t('network.zone.name')}>
          <Input
            id="zone-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <Field id="zone-color" label={t('network.zone.color')}>
          <div className="flex items-center gap-3">
            <input
              id="zone-color"
              type="color"
              className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background p-1"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
            <span className="font-mono text-sm text-muted-foreground">{color}</span>
          </div>
        </Field>
        <Field id="zone-description" label={t('network.zone.description')}>
          <textarea
            id="zone-description"
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {zone ? (
            <Button
              type="button"
              variant="outline"
              className="text-danger-600"
              disabled={busy}
              onClick={() => void remove()}
            >
              {t('actions.delete')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('actions.saving') : t('actions.save')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function defaultZoneBounds(index: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: (index % 3) * 660,
    y: Math.floor(index / 3) * 500,
    width: 620,
    height: 460,
  };
}

function NewAuditDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateNetworkAuditInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const now = new Date();
  const [name, setName] = useState(
    t('network.auditDefaultName', {
      year: now.getFullYear(),
      quarter: Math.floor(now.getMonth() / 3) + 1,
    }),
  );
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`,
  );
  const [scope, setScope] = useState('');
  const [methodology, setMethodology] = useState('');
  const [auditorName, setAuditorName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name,
        period,
        ...(scope.trim() ? { scope: scope.trim() } : {}),
        ...(methodology.trim() ? { methodology: methodology.trim() } : {}),
        ...(auditorName.trim() ? { auditorName: auditorName.trim() } : {}),
      });
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('network.auditCreateError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('network.newAudit')} onClose={onClose}>
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <Field id="audit-name" label={t('network.auditName')}>
          <Input
            id="audit-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <Field id="audit-period" label={t('network.auditPeriod')}>
          <Input
            id="audit-period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            required
          />
        </Field>
        <Field id="audit-scope" label={t('network.auditScope')}>
          <textarea
            id="audit-scope"
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          />
        </Field>
        <Field id="audit-methodology" label={t('network.auditMethodology')}>
          <textarea
            id="audit-methodology"
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={methodology}
            onChange={(event) => setMethodology(event.target.value)}
          />
        </Field>
        <Field id="audit-auditor" label={t('network.auditAuditor')}>
          <Input
            id="audit-auditor"
            value={auditorName}
            onChange={(event) => setAuditorName(event.target.value)}
          />
        </Field>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={busy || !name.trim() || !period.trim()}>
            {busy ? t('actions.saving') : t('actions.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ImportDialog({
  open,
  onClose,
  onImport,
  onDownloadTemplate,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (format: DeviceImportFormat, content: string) => Promise<DeviceImportResult>;
  onDownloadTemplate: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<DeviceImportFormat>('NMAP_XML');
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [result, setResult] = useState<DeviceImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFileName(null);
      setContent('');
      setResult(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const importFile = async () => {
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      const next = await onImport(format, content);
      setResult(next);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('network.import.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('network.import.title')} onClose={onClose} wide>
      <div className="space-y-4">
        <Alert variant="info">{t('network.import.help')}</Alert>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field id="import-format" label={t('network.import.format')}>
            <select
              id="import-format"
              className={selectClass}
              value={format}
              onChange={(event) => setFormat(event.target.value as DeviceImportFormat)}
            >
              <option value="NMAP_XML">{t('network.import.nmap')}</option>
              <option value="CSV">{t('network.import.csv')}</option>
            </select>
          </Field>
          <Field id="import-file" label={t('network.import.file')}>
            <Input
              id="import-file"
              type="file"
              accept=".xml,.csv,text/xml,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setFileName(file.name);
                const inferred = file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'NMAP_XML';
                setFormat(inferred);
                void file
                  .text()
                  .then(setContent)
                  .catch(() => setError(t('network.import.readError')));
              }}
            />
          </Field>
          <Button type="button" variant="outline" onClick={() => void onDownloadTemplate()}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('network.import.template')}
          </Button>
        </div>
        {fileName ? (
          <p className="text-sm text-muted-foreground">
            {t('network.import.selected', { name: fileName })}
          </p>
        ) : null}
        {result ? (
          <Alert variant="success">
            <p className="font-medium">{t('network.import.done')}</p>
            <p>
              {t('network.import.result', {
                created: result.created,
                updated: result.updated,
                skipped: result.skipped,
              })}
            </p>
            {result.warnings.length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-sm">
                {result.warnings.slice(0, 10).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {result ? t('actions.close') : t('actions.cancel')}
          </Button>
          <Button type="button" onClick={() => void importFile()} disabled={busy || !content}>
            <Files className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {busy ? t('network.import.importing') : t('network.import.import')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MergeDialog({
  open,
  auditId,
  onClose,
  onMerge,
  onCompleted,
}: {
  open: boolean;
  auditId: string | null;
  onClose: () => void;
  onMerge: (group: DuplicateDeviceGroup, targetId: string) => Promise<void>;
  onCompleted: () => void;
}) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<DuplicateDeviceGroup[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !auditId) return;
    setLoading(true);
    setError(null);
    networkApi
      .duplicates(auditId)
      .then((next) => {
        setGroups(next);
        setTargets(
          Object.fromEntries(
            next.map((group) => [`${group.reason}:${group.key}`, group.devices[0]?.id ?? '']),
          ),
        );
      })
      .catch((caught) =>
        setError(caught instanceof ApiClientError ? caught.message : t('network.merge.error')),
      )
      .finally(() => setLoading(false));
  }, [auditId, open, t]);

  if (!open) return null;

  const merge = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const group of groups) {
        const key = `${group.reason}:${group.key}`;
        const targetId = targets[key];
        if (targetId) await onMerge(group, targetId);
      }
      onCompleted();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('network.merge.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('network.merge.title')} onClose={onClose} wide>
      <div className="space-y-4">
        <Alert variant="info">{t('network.merge.help')}</Alert>
        {loading ? (
          <Alert role="status">{t('network.merge.loading')}</Alert>
        ) : groups.length === 0 ? (
          <Alert variant="success">{t('network.merge.none')}</Alert>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const key = `${group.reason}:${group.key}`;
              return (
                <div key={key} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="warning">{group.reason}</Badge>
                    <code className="text-sm">{group.key}</code>
                  </div>
                  <ul className="space-y-1">
                    {group.devices.map((device) => (
                      <li key={device.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`merge-${key}`}
                          checked={targets[key] === device.id}
                          onChange={() =>
                            setTargets((current) => ({ ...current, [key]: device.id }))
                          }
                          aria-label={t('network.merge.keep', { name: device.name })}
                        />
                        <DeviceTypeIcon type={device.type} className="h-4 w-4" />
                        {device.name}{' '}
                        <span className="text-muted-foreground">
                          {device.macAddress ?? device.ipAddresses.join(', ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" onClick={() => void merge()} disabled={busy || groups.length === 0}>
            {busy ? t('actions.saving') : t('network.merge.action')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ConnectionDialog({
  connection,
  onClose,
  onSave,
  onDelete,
}: {
  connection: NetworkConnection;
  onClose: () => void;
  onSave: (input: UpdateConnectionInput) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState(connection.type);
  const [speed, setSpeed] = useState(
    connection.speedMbps === null ? '' : String(connection.speedMbps),
  );
  const [vlan, setVlan] = useState(connection.vlan === null ? '' : String(connection.vlan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({
        type,
        speedMbps: speed ? Number(speed) : null,
        vlan: vlan ? Number(vlan) : null,
      });
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : t('network.connection.saveError'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('network.connection.title')} onClose={onClose}>
      <form className="space-y-4" onSubmit={(event) => void save(event)}>
        <Field id="connection-type" label={t('network.connection.type')}>
          <select
            id="connection-type"
            className={selectClass}
            value={type}
            onChange={(event) => setType(event.target.value as NetworkConnection['type'])}
          >
            <option value="WIRED">{t('network.options.WIRED')}</option>
            <option value="WIRELESS">{t('network.options.WIRELESS')}</option>
            <option value="VPN">{t('network.options.VPN')}</option>
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="connection-speed" label={t('network.connection.speed')}>
            <Input
              id="connection-speed"
              type="number"
              min={1}
              value={speed}
              onChange={(event) => setSpeed(event.target.value)}
            />
          </Field>
          <Field id="connection-vlan" label={t('network.connection.vlan')}>
            <Input
              id="connection-vlan"
              type="number"
              min={0}
              max={4094}
              value={vlan}
              onChange={(event) => setVlan(event.target.value)}
            />
          </Field>
        </div>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            className="text-danger-600"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(t('network.connection.deleteConfirm'))) return;
              setBusy(true);
              void onDelete()
                .catch((caught) =>
                  setError(
                    caught instanceof ApiClientError
                      ? caught.message
                      : t('network.connection.deleteError'),
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {t('actions.delete')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('actions.saving') : t('actions.save')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
