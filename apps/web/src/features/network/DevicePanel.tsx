import { AlertTriangle, CheckCircle2, FileWarning, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  DEVICE_ASSESSMENT_GROUPS,
  DEVICE_ASSESSMENT_GROUPS_BY_TYPE,
  deviceTypeSchema,
  evaluateDeviceCompleteness,
  licenseExpiryStatus,
  type DeviceAssessmentData,
  type DeviceAssessmentFieldKey,
  type DeviceType,
  type NetworkDevice,
  type NetworkZone,
  type Severity,
} from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Progress } from '@/components/ui/Progress';
import { ApiClientError, networkApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { DeviceTypeIcon } from './device-visuals';

type Tab = 'identity' | (typeof DEVICE_ASSESSMENT_GROUPS)[number]['key'];

type FieldKind = 'text' | 'textarea' | 'date' | 'number' | 'boolean' | 'list' | 'multi';

const FIELD_KIND: Record<DeviceAssessmentFieldKey, FieldKind> = {
  os: 'text',
  osVersion: 'text',
  endOfSupportDate: 'date',
  lastPatchDate: 'date',
  autoUpdate: 'boolean',
  antivirusPresent: 'boolean',
  antivirusProduct: 'text',
  licenseExpiryDate: 'date',
  realTimeProtection: 'boolean',
  lastScanDate: 'date',
  mfaEnabled: 'boolean',
  mfaType: 'text',
  adminAccountCount: 'number',
  defaultCredentialsChanged: 'boolean',
  localAdminRights: 'boolean',
  remoteAccess: 'multi',
  passwordPolicy: 'textarea',
  backupExists: 'boolean',
  backupMethod: 'text',
  backupFrequency: 'text',
  backupLocations: 'multi',
  lastBackupDate: 'date',
  lastRestoreTestDate: 'date',
  rtoHours: 'number',
  rpoHours: 'number',
  openPorts: 'list',
  internetExposed: 'boolean',
  firewallReviewed: 'boolean',
  segmentation: 'textarea',
  encryptionInTransit: 'boolean',
  diskEncryption: 'boolean',
  personalData: 'boolean',
  encryptionAtRest: 'boolean',
  logsEnabled: 'boolean',
  centralLogging: 'boolean',
  logRetentionDays: 'number',
  physicalAccessControlled: 'boolean',
  physicalLocation: 'text',
};

const REMOTE_ACCESS_OPTIONS = ['RDP', 'SSH', 'VPN', 'TEAMVIEWER', 'OTHER'] as const;
const BACKUP_LOCATION_OPTIONS = ['LOCAL', 'OFFSITE', 'IMMUTABLE', 'CLOUD'] as const;

interface IdentityState {
  name: string;
  type: DeviceType;
  vendor: string;
  model: string;
  serial: string;
  ipAddresses: string;
  macAddress: string;
  location: string;
  ownerLabel: string;
  criticality: Severity;
  dataClassification: string;
  businessServices: string;
  zoneId: string;
  notes: string;
}

const SEVERITY_KEYS = {
  LOW: 'severity.low',
  MEDIUM: 'severity.medium',
  HIGH: 'severity.high',
  CRITICAL: 'severity.critical',
} as const;

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const textareaClass =
  'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function identityFromDevice(device: NetworkDevice): IdentityState {
  return {
    name: device.name,
    type: device.type,
    vendor: device.vendor ?? '',
    model: device.model ?? '',
    serial: device.serial ?? '',
    ipAddresses: device.ipAddresses.join(', '),
    macAddress: device.macAddress ?? '',
    location: device.location ?? '',
    ownerLabel: device.ownerLabel ?? '',
    criticality: device.criticality ?? 'MEDIUM',
    dataClassification: device.dataClassification ?? '',
    businessServices: device.businessServices.join(', '),
    zoneId: device.zoneId ?? '',
    notes: device.notes ?? '',
  };
}

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function DevicePanel({
  auditId,
  device,
  zones,
  onClose,
  onSaved,
  onDeleted,
}: {
  auditId: string;
  device: NetworkDevice;
  zones: NetworkZone[];
  onClose: () => void;
  onSaved: (device: NetworkDevice) => void;
  onDeleted: (deviceId: string) => void;
}) {
  const { t } = useTranslation();
  const [identity, setIdentity] = useState<IdentityState>(() => identityFromDevice(device));
  const [assessment, setAssessment] = useState<DeviceAssessmentData>(() => device.assessment);
  const [informationComplete, setInformationComplete] = useState(device.informationComplete);
  const [activeTab, setActiveTab] = useState<Tab>('identity');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIdentity(identityFromDevice(device));
    setAssessment(device.assessment);
    setInformationComplete(device.informationComplete);
    setError(null);
  }, [device.id, device.updatedAt, device]);

  const tabs = useMemo<Tab[]>(
    () => ['identity', ...(DEVICE_ASSESSMENT_GROUPS_BY_TYPE[identity.type] ?? [])],
    [identity.type],
  );

  useEffect(() => {
    if (!tabs.includes(activeTab)) setActiveTab('identity');
  }, [activeTab, tabs]);

  const live = useMemo(
    () =>
      evaluateDeviceCompleteness({
        type: identity.type,
        name: identity.name,
        ipAddresses: splitList(identity.ipAddresses),
        macAddress: identity.macAddress || null,
        criticality: identity.criticality,
        ownerLabel: identity.ownerLabel,
        assessment,
      }),
    [assessment, identity],
  );

  const canMarkComplete = live.informationCompleteAllowed;
  const checkedComplete = informationComplete && canMarkComplete;

  const updateData = (key: DeviceAssessmentFieldKey, value: unknown) => {
    setAssessment((current) => {
      const next = { ...current } as Record<string, unknown>;
      if (value === undefined || value === '') delete next[key];
      else next[key] = value;
      return next as DeviceAssessmentData;
    });
  };

  const save = async () => {
    setError(null);
    if (!identity.name.trim()) {
      setError(t('network.device.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const ipAddresses = splitList(identity.ipAddresses);
      const updated = await networkApi.updateDevice(auditId, device.id, {
        name: identity.name.trim(),
        type: identity.type,
        vendor: identity.vendor.trim() || null,
        model: identity.model.trim() || null,
        serial: identity.serial.trim() || null,
        ipAddresses,
        macAddress: identity.macAddress.trim() || null,
        location: identity.location.trim() || null,
        ownerLabel: identity.ownerLabel.trim() || null,
        criticality: identity.criticality,
        dataClassification: identity.dataClassification.trim() || null,
        businessServices: splitList(identity.businessServices),
        zoneId: identity.zoneId || null,
        notes: identity.notes.trim() || null,
      });
      const result = await networkApi.saveAssessment(auditId, device.id, {
        data: assessment,
        informationComplete: checkedComplete,
      });
      setInformationComplete(result.informationComplete);
      onSaved(result ?? updated);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('network.device.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('network.device.deleteConfirm', { name: device.name }))) return;
    setSaving(true);
    setError(null);
    try {
      await networkApi.deleteDevice(auditId, device.id);
      onDeleted(device.id);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('network.device.deleteError'));
    } finally {
      setSaving(false);
    }
  };

  const renderField = (key: DeviceAssessmentFieldKey) => {
    const kind = FIELD_KIND[key];
    const id = `device-field-${key}`;
    const label = t(`network.fields.${key}`, { defaultValue: key });
    const value = assessment[key];
    const licenseStatus =
      key === 'licenseExpiryDate' && typeof value === 'string' ? licenseExpiryStatus(value) : null;

    if (kind === 'multi') {
      const options = key === 'remoteAccess' ? REMOTE_ACCESS_OPTIONS : BACKUP_LOCATION_OPTIONS;
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Field key={key} id={id} label={label}>
          <div id={id} className="flex flex-wrap gap-3 rounded-md border border-border p-3">
            {options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary-600"
                  checked={selected.includes(option)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...selected, option]
                      : selected.filter((item) => item !== option);
                    updateData(key, next.length > 0 ? next : undefined);
                  }}
                />
                {t(`network.options.${option}`)}
              </label>
            ))}
          </div>
        </Field>
      );
    }

    if (kind === 'boolean') {
      return (
        <Field key={key} id={id} label={label}>
          <select
            id={id}
            className={selectClass}
            value={value === undefined ? '' : value ? 'yes' : 'no'}
            onChange={(event) => {
              const next = event.target.value;
              updateData(key, next === '' ? undefined : next === 'yes');
            }}
          >
            <option value="">{t('network.fields.notSet')}</option>
            <option value="yes">{t('common.yes')}</option>
            <option value="no">{t('common.no')}</option>
          </select>
        </Field>
      );
    }

    return (
      <Field key={key} id={id} label={label}>
        {kind === 'textarea' ? (
          <textarea
            id={id}
            className={textareaClass}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => updateData(key, event.target.value)}
          />
        ) : kind === 'list' ? (
          <textarea
            id={id}
            className={textareaClass}
            placeholder={t('network.device.openPortsHint')}
            value={Array.isArray(value) ? value.join(', ') : ''}
            onChange={(event) => {
              const next = splitList(event.target.value);
              updateData(key, next.length > 0 ? next : undefined);
            }}
          />
        ) : (
          <Input
            id={id}
            type={kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text'}
            min={kind === 'number' ? 0 : undefined}
            value={value === undefined || value === null ? '' : String(value)}
            className={cn(
              licenseStatus === 'EXPIRED' && 'border-danger-500',
              (licenseStatus === 'DUE_7' || licenseStatus === 'DUE_30') && 'border-warning-500',
            )}
            onChange={(event) => {
              const raw = event.target.value;
              if (kind === 'number') {
                updateData(key, raw === '' ? undefined : Number(raw));
              } else {
                updateData(key, raw);
              }
            }}
          />
        )}
        {licenseStatus ? (
          <p
            className={cn(
              'text-xs font-medium',
              licenseStatus === 'EXPIRED' ? 'text-danger-600' : 'text-warning-700',
            )}
          >
            {t(`network.license.${licenseStatus}`)}
          </p>
        ) : null}
      </Field>
    );
  };

  const group = DEVICE_ASSESSMENT_GROUPS.find((candidate) => candidate.key === activeTab);
  const completeTone = checkedComplete
    ? live.riskCodes.length > 0
      ? 'warning'
      : 'success'
    : 'neutral';

  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl"
      aria-label={t('network.device.panelLabel', { name: device.name })}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-lg bg-primary-50 p-2 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200">
            <DeviceTypeIcon type={identity.type} className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{identity.name || device.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="primary">{t(`network.types.${identity.type}`)}</Badge>
              <Badge variant={completeTone === 'neutral' ? 'neutral' : completeTone}>
                {checkedComplete
                  ? live.riskCodes.length > 0
                    ? t('network.device.completeWithRisk')
                    : t('network.device.complete')
                  : t('network.device.completeness', { value: live.percentage })}
              </Badge>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('actions.close')}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 border-b border-border p-5">
          <Progress value={live.percentage} label={t('network.device.dataCompleteness')} />
          {live.missingRequired.length > 0 ? (
            <div className="rounded-md border border-warning-500/40 bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-100">
              <p className="font-medium">{t('network.device.missingTitle')}</p>
              <ul className="mt-1 list-inside list-disc">
                {live.missingRequired.map((field) => (
                  <li key={field}>{missingLabel(t, field)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {live.riskCodes.length > 0 ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-warning-700 dark:text-warning-100">
                {t('network.device.risksTitle')}
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {live.riskCodes.map((code) => (
                  <li key={code} className="flex items-start gap-2">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-warning-600"
                      aria-hidden="true"
                    />
                    {t(`network.risks.${code}`)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary-600"
              checked={checkedComplete}
              disabled={!canMarkComplete}
              onChange={(event) => setInformationComplete(event.target.checked)}
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                {checkedComplete && live.riskCodes.length === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-success-600" aria-hidden="true" />
                ) : null}
                {t('network.device.informationComplete')}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {canMarkComplete
                  ? t('network.device.informationCompleteHint')
                  : t('network.device.informationCompleteDisabled')}
              </span>
            </span>
          </label>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-border px-5 py-3">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium',
                activeTab === tab
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              onClick={() => setActiveTab(tab)}
            >
              {t(`network.tabs.${tab}`)}
            </button>
          ))}
        </div>

        <div className="space-y-4 p-5">
          {activeTab === 'identity' ? (
            <>
              <Field id="device-name" label={t('network.device.name')}>
                <Input
                  id="device-name"
                  value={identity.name}
                  onChange={(event) =>
                    setIdentity((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="device-type" label={t('network.device.type')}>
                  <select
                    id="device-type"
                    className={selectClass}
                    value={identity.type}
                    onChange={(event) =>
                      setIdentity((current) => ({
                        ...current,
                        type: deviceTypeSchema.parse(event.target.value),
                      }))
                    }
                  >
                    {deviceTypeSchema.options.map((type) => (
                      <option key={type} value={type}>
                        {t(`network.types.${type}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="device-criticality" label={t('network.device.criticality')}>
                  <select
                    id="device-criticality"
                    className={selectClass}
                    value={identity.criticality}
                    onChange={(event) =>
                      setIdentity((current) => ({
                        ...current,
                        criticality: event.target.value as Severity,
                      }))
                    }
                  >
                    {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((severity) => (
                      <option key={severity} value={severity}>
                        {t(SEVERITY_KEYS[severity])}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="device-vendor" label={t('network.device.vendor')}>
                  <Input
                    id="device-vendor"
                    value={identity.vendor}
                    onChange={(event) =>
                      setIdentity((current) => ({ ...current, vendor: event.target.value }))
                    }
                  />
                </Field>
                <Field id="device-model" label={t('network.device.model')}>
                  <Input
                    id="device-model"
                    value={identity.model}
                    onChange={(event) =>
                      setIdentity((current) => ({ ...current, model: event.target.value }))
                    }
                  />
                </Field>
                <Field id="device-serial" label={t('network.device.serial')}>
                  <Input
                    id="device-serial"
                    value={identity.serial}
                    onChange={(event) =>
                      setIdentity((current) => ({ ...current, serial: event.target.value }))
                    }
                  />
                </Field>
                <Field id="device-owner" label={t('network.device.owner')}>
                  <Input
                    id="device-owner"
                    value={identity.ownerLabel}
                    onChange={(event) =>
                      setIdentity((current) => ({ ...current, ownerLabel: event.target.value }))
                    }
                  />
                </Field>
              </div>
              <Field id="device-ip" label={t('network.device.ipAddresses')}>
                <Input
                  id="device-ip"
                  placeholder="192.0.2.10, 192.0.2.11"
                  value={identity.ipAddresses}
                  onChange={(event) =>
                    setIdentity((current) => ({ ...current, ipAddresses: event.target.value }))
                  }
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="device-mac" label={t('network.device.macAddress')}>
                  <Input
                    id="device-mac"
                    placeholder="AA:BB:CC:DD:EE:FF"
                    value={identity.macAddress}
                    onChange={(event) =>
                      setIdentity((current) => ({ ...current, macAddress: event.target.value }))
                    }
                  />
                </Field>
                <Field id="device-location" label={t('network.device.location')}>
                  <Input
                    id="device-location"
                    value={identity.location}
                    onChange={(event) =>
                      setIdentity((current) => ({ ...current, location: event.target.value }))
                    }
                  />
                </Field>
                <Field id="device-zone" label={t('network.device.zone')}>
                  <select
                    id="device-zone"
                    className={selectClass}
                    value={identity.zoneId}
                    onChange={(event) =>
                      setIdentity((current) => ({ ...current, zoneId: event.target.value }))
                    }
                  >
                    <option value="">{t('network.device.noZone')}</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  id="device-data-classification"
                  label={t('network.device.dataClassification')}
                >
                  <Input
                    id="device-data-classification"
                    value={identity.dataClassification}
                    onChange={(event) =>
                      setIdentity((current) => ({
                        ...current,
                        dataClassification: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
              <Field id="device-services" label={t('network.device.businessServices')}>
                <Input
                  id="device-services"
                  placeholder={t('network.device.businessServicesHint')}
                  value={identity.businessServices}
                  onChange={(event) =>
                    setIdentity((current) => ({
                      ...current,
                      businessServices: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field id="device-notes" label={t('network.device.notes')}>
                <textarea
                  id="device-notes"
                  className={textareaClass}
                  value={identity.notes}
                  onChange={(event) =>
                    setIdentity((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </Field>
              <Alert variant="info">
                <span className="flex items-start gap-2">
                  <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('network.device.attachmentNote')}
                </span>
              </Alert>
            </>
          ) : group ? (
            <div className="space-y-4">{group.fields.map(renderField)}</div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="border-t border-border p-4">
          <Alert variant="danger" role="alert">
            {error}
          </Alert>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
        <Button
          variant="outline"
          onClick={() => void remove()}
          disabled={saving}
          className="text-danger-600"
        >
          <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('network.device.delete')}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('actions.close')}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? t('network.device.saving') : t('actions.save')}
          </Button>
        </div>
      </div>
    </aside>
  );
}

function missingLabel(t: TFunction, field: string): string {
  if (field === 'identity.name') return t('network.device.name');
  if (field === 'identity.identifier') return t('network.device.identifier');
  if (field === 'identity.criticality') return t('network.device.criticality');
  if (field === 'identity.ownerLabel') return t('network.device.owner');
  return t(`network.fields.${field}`, { defaultValue: field });
}
