import type {
  Audit,
  CompanyProfile,
  Connection,
  Device,
  DeviceAssessment,
  Finding,
  Organization,
  User,
  Zone,
} from '@prisma/client';
import {
  FINDING_CATEGORY_LABEL,
  FINDING_CATEGORY_LEGAL_REFERENCE,
  compareFindings,
  evaluateDeviceCompleteness,
  type AuditComparison,
  type DeviceAssessmentData,
  type DeviceRiskCode,
  type DeviceType,
  type FindingCategory,
  type Severity,
} from '@nis2/shared';
import type { ExportLocale, ExportLogo } from './export-model';

export interface AuditDiagram {
  data: Buffer;
  width: number;
  height: number;
}

export type AuditWithReportRelations = Audit & {
  devices: Array<Device & { assessment: DeviceAssessment | null; zone: Zone | null }>;
  zones: Zone[];
  connections: Connection[];
  findings: Array<
    Finding & {
      owner: User | null;
      devices: Array<{ device: Pick<Device, 'id' | 'name' | 'type' | 'ipAddresses'> }>;
    }
  >;
};

export interface AuditReportDeviceRow {
  name: string;
  type: string;
  ipAddresses: string;
  macAddress: string;
  zone: string;
  criticality: string;
  completeness: number;
  scanState: string;
  risks: string;
}

export interface AuditReportFindingRow {
  code: string;
  title: string;
  severity: Severity;
  status: string;
  category: string;
  legalReference: string;
  devices: string;
  owner: string;
  dueDate: string;
  riskScore: string;
  proposedSolution: string;
}

export interface AuditReportArt21Row {
  category: string;
  legalReference: string;
  count: number;
  highestSeverity: string;
}

export interface AuditReportRoadmapGroup {
  title: string;
  items: string[];
}

export interface AuditReportHeatCell {
  likelihood: number;
  impact: number;
  count: number;
}

export interface AuditReportModel {
  kind: 'audit';
  organizationName: string;
  legalName: string;
  auditName: string;
  period: string;
  status: string;
  generatedAt: string;
  closedAt: string | null;
  scope: string;
  methodology: string;
  auditorName: string;
  limitations: string;
  logo: ExportLogo | null;
  networkDiagram: AuditDiagram;
  deviceCount: number;
  completeCount: number;
  averageCompleteness: number;
  riskDeviceCount: number;
  totalFindings: number;
  openFindings: number;
  criticalFindings: number;
  highFindings: number;
  riskScore: number;
  devices: AuditReportDeviceRow[];
  findings: AuditReportFindingRow[];
  art21: AuditReportArt21Row[];
  roadmap: AuditReportRoadmapGroup[];
  heatMap: AuditReportHeatCell[];
  comparison: AuditComparison | null;
  previousName: string | null;
  comparisonSummary: string[];
  signature: Array<{ role: string; name: string; date: string }>;
  disclaimer: string;
  legalReviewNotice: string;
}

const DISCLAIMER: Record<ExportLocale, string> = {
  en: 'This tool supports compliance preparation and does not constitute legal advice.',
  ro: 'Acest instrument sprijinÄƒ pregÄƒtirea conformÄƒrii È™i nu constituie consultanÈ›Äƒ juridicÄƒ.',
};

const LEGAL_REVIEW_NOTICE: Record<ExportLocale, string> = {
  en: 'Confirm the current national guidance and DNSC reporting channels before submitting this audit report.',
  ro: 'ConfirmaÈ›i Ã®ndrumÄƒrile naÈ›ionale actuale È™i canalele de raportare DNSC Ã®nainte de a depune acest raport de audit.',
};

const RISK_LABEL: Record<DeviceRiskCode, string> = {
  AV_MISSING: 'Endpoint protection missing',
  AV_EXPIRED: 'Endpoint protection expired',
  LICENSE_EXPIRING: 'Licence expiring',
  OS_EOL: 'OS end of life',
  PATCH_STALE: 'Patching overdue',
  NO_BACKUP: 'No backup',
  BACKUP_NOT_TESTED: 'Backup not restore-tested',
  MFA_MISSING_REMOTE: 'MFA missing for remote access',
  DEFAULT_CREDENTIALS: 'Default credentials',
  INTERNET_EXPOSED: 'Internet exposed',
  LOGGING_DISABLED: 'Logging disabled',
  CENTRAL_LOGGING_MISSING: 'Central logging missing',
  DISK_ENCRYPTION_MISSING: 'Disk encryption missing',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  MITIGATED: 'Mitigated',
  ACCEPTED_RISK: 'Accepted risk',
  CLOSED: 'Closed',
  DRAFT: 'Draft',
  CLOSED_AUDIT: 'Closed',
};

export function buildAuditReportModel(input: {
  organization: Organization;
  profile: CompanyProfile | null;
  audit: AuditWithReportRelations;
  previousAudit: AuditWithReportRelations | null;
  logo: ExportLogo | null;
  networkDiagram: AuditDiagram;
  locale: ExportLocale;
}): AuditReportModel {
  const { audit, locale } = input;
  const devices = audit.devices.map((device) => {
    const assessment = assessmentOf(device.assessment);
    const computed = evaluateDeviceCompleteness(
      {
        type: device.type as DeviceType,
        name: device.name,
        ipAddresses: device.ipAddresses,
        macAddress: device.macAddress,
        criticality: device.criticality,
        ownerLabel: device.ownerLabel,
        assessment,
      },
      { today: new Date() },
    );
    return {
      device,
      row: {
        name: device.name ?? 'Unnamed device',
        type: device.type,
        ipAddresses: device.ipAddresses.join(', ') || '-',
        macAddress: device.macAddress ?? '-',
        zone: device.zone?.name ?? '-',
        criticality: device.criticality ?? 'MEDIUM',
        completeness: device.completeness || computed.percentage,
        scanState: device.scanState,
        risks: computed.riskCodes.map((code) => RISK_LABEL[code]).join('; ') || '-',
      } satisfies AuditReportDeviceRow,
      computed,
    };
  });

  const sortedFindings = [...audit.findings].sort(
    (left, right) =>
      severityRank(right.severity as Severity) - severityRank(left.severity as Severity) ||
      (right.riskScore ?? 0) - (left.riskScore ?? 0) ||
      left.title.localeCompare(right.title),
  );
  const findings = sortedFindings.map((finding) => ({
    code: finding.code ?? '-',
    title: finding.title,
    severity: finding.severity as Severity,
    status: STATUS_LABEL[finding.status] ?? finding.status,
    category: FINDING_CATEGORY_LABEL[(finding.category ?? 'OTHER') as FindingCategory],
    legalReference:
      FINDING_CATEGORY_LEGAL_REFERENCE[(finding.category ?? 'OTHER') as FindingCategory] ??
      'NIS2 Art. 21(2)',
    devices: finding.organizationWide
      ? 'Organization-wide'
      : finding.devices.map((entry) => entry.device.name ?? 'Unnamed device').join(', ') || '-',
    owner: finding.owner ? `${finding.owner.givenName} ${finding.owner.familyName}` : '-',
    dueDate: finding.dueDate ? formatDate(finding.dueDate, locale) : '-',
    riskScore: finding.riskScore ? String(finding.riskScore) : '-',
    proposedSolution: finding.proposedSolution ?? '-',
  })) satisfies AuditReportFindingRow[];

  const openFindings = sortedFindings.filter((finding) => finding.status !== 'CLOSED');
  const art21 = buildArt21(openFindings);
  const heatMap = buildHeatMap(openFindings);

  const riskDeviceCount = devices.filter((entry) => entry.computed.riskCodes.length > 0).length;
  const completeCount = devices.filter((entry) => entry.device.informationComplete).length;
  const averageCompleteness =
    devices.length === 0
      ? 0
      : Math.round(
          devices.reduce((sum, entry) => sum + entry.row.completeness, 0) / devices.length,
        );
  const previousRiskDeviceCount = input.previousAudit
    ? input.previousAudit.devices.filter((device) =>
        hasRisk(device, assessmentOf(device.assessment)),
      ).length
    : 0;
  const previousAverageCompleteness =
    !input.previousAudit || input.previousAudit.devices.length === 0
      ? 0
      : Math.round(
          input.previousAudit.devices.reduce(
            (sum, device) => sum + deviceCompleteness(device, assessmentOf(device.assessment)),
            0,
          ) / input.previousAudit.devices.length,
        );
  const comparison = input.previousAudit
    ? {
        currentAuditId: audit.id,
        previousAuditId: input.previousAudit.id,
        currentName: audit.name,
        previousName: input.previousAudit.name,
        deviceDelta: audit.devices.length - input.previousAudit.devices.length,
        completenessDelta: averageCompleteness - previousAverageCompleteness,
        riskDeviceDelta: riskDeviceCount - previousRiskDeviceCount,
        findings: compareFindings(
          audit.findings.map((finding) => ({
            id: finding.id,
            code: finding.code,
            title: finding.title,
            severity: finding.severity as Severity,
            status: finding.status,
            riskScore: finding.riskScore,
          })),
          input.previousAudit.findings.map((finding) => ({
            id: finding.id,
            code: finding.code,
            title: finding.title,
            severity: finding.severity as Severity,
            status: finding.status,
            riskScore: finding.riskScore,
          })),
        ),
      }
    : null;

  return {
    kind: 'audit',
    organizationName: input.organization.name,
    legalName: input.profile?.legalName ?? input.organization.name,
    auditName: audit.name,
    period: audit.period,
    status: STATUS_LABEL[audit.status] ?? audit.status,
    generatedAt: new Date().toISOString(),
    closedAt: audit.closedAt?.toISOString() ?? null,
    scope: audit.scope ?? 'Not recorded',
    methodology: audit.methodology ?? 'Not recorded',
    auditorName: audit.auditorName ?? 'Not recorded',
    limitations: audit.limitations ?? 'None recorded',
    logo: input.logo,
    networkDiagram: input.networkDiagram,
    deviceCount: audit.devices.length,
    completeCount,
    averageCompleteness,
    riskDeviceCount,
    totalFindings: audit.findings.length,
    openFindings: openFindings.length,
    criticalFindings: openFindings.filter((finding) => finding.severity === 'CRITICAL').length,
    highFindings: openFindings.filter((finding) => finding.severity === 'HIGH').length,
    riskScore: openFindings.reduce(
      (sum, finding) => sum + (finding.riskScore ?? severityRank(finding.severity as Severity) * 4),
      0,
    ),
    devices: devices.map((entry) => entry.row),
    findings,
    art21,
    roadmap: buildRoadmap(sortedFindings),
    heatMap,
    comparison,
    previousName: input.previousAudit?.name ?? null,
    comparisonSummary: buildComparisonSummary(comparison, input.previousAudit?.name ?? null),
    signature: [
      {
        role: 'Auditor',
        name: audit.auditorName ?? '',
        date: audit.closedAt ? formatDate(audit.closedAt, locale) : '',
      },
      {
        role: 'Management body',
        name: ' ',
        date: ' ',
      },
    ],
    disclaimer: DISCLAIMER[locale],
    legalReviewNotice: LEGAL_REVIEW_NOTICE[locale],
  };
}

function buildArt21(findings: Finding[]): AuditReportArt21Row[] {
  const map = new Map<FindingCategory, { count: number; severity: Severity }>();
  for (const finding of findings) {
    const category = (finding.category ?? 'OTHER') as FindingCategory;
    const current = map.get(category);
    const severity = finding.severity as Severity;
    if (!current) {
      map.set(category, { count: 1, severity });
    } else {
      current.count += 1;
      if (severityRank(severity) > severityRank(current.severity)) current.severity = severity;
    }
  }
  return [...map.entries()]
    .sort((left, right) => severityRank(right[1].severity) - severityRank(left[1].severity))
    .map(([category, value]) => ({
      category: FINDING_CATEGORY_LABEL[category],
      legalReference: FINDING_CATEGORY_LEGAL_REFERENCE[category],
      count: value.count,
      highestSeverity: value.severity,
    }));
}

function buildRoadmap(findings: Finding[]): AuditReportRoadmapGroup[] {
  const open = findings.filter((finding) => finding.status !== 'CLOSED');
  return [
    {
      title: 'Quick wins (0-30 days)',
      items: open
        .filter(
          (finding) =>
            finding.effort === 'S' ||
            finding.severity === 'CRITICAL' ||
            (finding.severity === 'HIGH' && finding.effort !== 'L'),
        )
        .slice(0, 8)
        .map((finding) => `${finding.code ?? '-'} ${finding.title}`),
    },
    {
      title: 'Planned remediation (30-60 days)',
      items: open
        .filter((finding) => finding.effort === 'M' && finding.severity !== 'CRITICAL')
        .slice(0, 8)
        .map((finding) => `${finding.code ?? '-'} ${finding.title}`),
    },
    {
      title: 'Strategic remediation (60-90 days)',
      items: open
        .filter((finding) => finding.effort === 'L')
        .slice(0, 8)
        .map((finding) => `${finding.code ?? '-'} ${finding.title}`),
    },
  ];
}

function buildHeatMap(findings: Finding[]): AuditReportHeatCell[] {
  const cells: AuditReportHeatCell[] = [];
  for (let impact = 5; impact >= 1; impact -= 1) {
    for (let likelihood = 1; likelihood <= 5; likelihood += 1) {
      cells.push({ likelihood, impact, count: 0 });
    }
  }
  for (const finding of findings) {
    const likelihood = finding.likelihood ?? defaultScore(finding.severity as Severity).likelihood;
    const impact = finding.impact ?? defaultScore(finding.severity as Severity).impact;
    const cell = cells.find((entry) => entry.likelihood === likelihood && entry.impact === impact);
    if (cell) cell.count += 1;
  }
  return cells;
}

function buildComparisonSummary(
  comparison: AuditComparison | null,
  previousName: string | null,
): string[] {
  if (!comparison) {
    return [
      previousName
        ? `Comparison with ${previousName} could not be calculated.`
        : 'No previous audit was selected for comparison.',
    ];
  }
  return [
    `Device inventory changed by ${signed(comparison.deviceDelta)} device(s).`,
    `Average completeness changed by ${signed(comparison.completenessDelta)} percentage point(s).`,
    `Devices with at least one risk changed by ${signed(comparison.riskDeviceDelta)}.`,
    `Findings opened: ${comparison.findings.opened}; closed: ${comparison.findings.closed}; carried forward: ${comparison.findings.carried}.`,
    `Open risk score changed by ${signed(comparison.findings.riskScoreCurrent - comparison.findings.riskScorePrevious)}.`,
  ];
}

function assessmentOf(assessment: DeviceAssessment | null): DeviceAssessmentData {
  if (!assessment) return {};
  return (assessment.data ?? {}) as DeviceAssessmentData;
}

function defaultScore(severity: Severity): { likelihood: number; impact: number } {
  return {
    LOW: { likelihood: 2, impact: 2 },
    MEDIUM: { likelihood: 3, impact: 3 },
    HIGH: { likelihood: 4, impact: 4 },
    CRITICAL: { likelihood: 5, impact: 5 },
  }[severity];
}

function severityRank(severity: Severity): number {
  return { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[severity];
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatDate(value: Date | string, locale: ExportLocale): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  return new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function deviceCompleteness(
  device: {
    type: string;
    name: string | null;
    ipAddresses: string[];
    macAddress: string | null;
    criticality: string | null;
    ownerLabel: string | null;
    completeness: number;
  },
  assessment: DeviceAssessmentData,
): number {
  if (device.completeness > 0) return device.completeness;
  return evaluateDeviceCompleteness({
    type: device.type as DeviceType,
    name: device.name,
    ipAddresses: device.ipAddresses,
    macAddress: device.macAddress,
    criticality: device.criticality,
    ownerLabel: device.ownerLabel,
    assessment,
  }).percentage;
}

function hasRisk(
  device: {
    type: string;
    name: string | null;
    ipAddresses: string[];
    macAddress: string | null;
    criticality: string | null;
    ownerLabel: string | null;
  },
  assessment: DeviceAssessmentData,
): boolean {
  return (
    evaluateDeviceCompleteness({
      type: device.type as DeviceType,
      name: device.name,
      ipAddresses: device.ipAddresses,
      macAddress: device.macAddress,
      criticality: device.criticality,
      ownerLabel: device.ownerLabel,
      assessment,
    }).riskCodes.length > 0
  );
}
