import JSZip from 'jszip';
import sharp from 'sharp';
import type { AuditReportModel } from './audit-report-model';
import { renderAuditReportDocx } from './export-docx';
import { renderAuditReportPdf } from './export-pdf';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

const model: AuditReportModel = {
  kind: 'audit',
  organizationName: 'Demo SME SRL',
  legalName: 'Demo SME SRL',
  auditName: 'Audit 2026-Q4',
  period: '2026-Q4',
  status: 'Closed',
  generatedAt: '2026-11-16T10:00:00.000Z',
  closedAt: '2026-11-16T09:00:00.000Z',
  scope: 'Office LAN and cloud services',
  methodology: 'Inventory review, device assessment and non-intrusive scanning.',
  auditorName: 'Demo Owner',
  limitations: 'No penetration testing.',
  logo: null,
  networkDiagram: { data: png, width: 1, height: 1 },
  deviceCount: 2,
  completeCount: 1,
  averageCompleteness: 75,
  riskDeviceCount: 1,
  totalFindings: 2,
  openFindings: 1,
  criticalFindings: 0,
  highFindings: 1,
  riskScore: 16,
  devices: [
    {
      name: 'Core firewall',
      type: 'FIREWALL',
      ipAddresses: '192.168.1.1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      zone: 'LAN',
      criticality: 'HIGH',
      completeness: 100,
      scanState: 'UNCHANGED',
      risks: 'Patching overdue',
    },
    {
      name: 'Backup NAS',
      type: 'NAS',
      ipAddresses: '192.168.1.10',
      macAddress: '—',
      zone: 'Server VLAN',
      criticality: 'MEDIUM',
      completeness: 50,
      scanState: 'CHANGED',
      risks: 'Backup not restore-tested',
    },
  ],
  findings: [
    {
      code: 'F-0001',
      title: 'Remote access is not protected by MFA',
      severity: 'HIGH',
      status: 'Open',
      category: 'Access control and asset management',
      legalReference: 'NIS2 Art. 21(2)(i)',
      devices: 'Core firewall',
      owner: 'Demo Owner',
      dueDate: '2026-12-01',
      riskScore: '16',
      proposedSolution: 'Enforce MFA and remove unused remote services.',
    },
    {
      code: 'F-0002',
      title: 'Default credentials may still be in use',
      severity: 'CRITICAL',
      status: 'Closed',
      category: 'Access control and asset management',
      legalReference: 'NIS2 Art. 21(2)(i)',
      devices: 'Core firewall',
      owner: 'Demo Owner',
      dueDate: '2026-11-20',
      riskScore: '25',
      proposedSolution: 'Change credentials and restrict management access.',
    },
  ],
  art21: [
    {
      category: 'Access control and asset management',
      legalReference: 'NIS2 Art. 21(2)(i)',
      count: 1,
      highestSeverity: 'HIGH',
    },
  ],
  roadmap: [
    { title: 'Quick wins (0–30 days)', items: ['F-0001 Remote access is not protected by MFA'] },
    { title: 'Planned remediation (30–60 days)', items: [] },
    { title: 'Strategic remediation (60–90 days)', items: [] },
  ],
  heatMap: Array.from({ length: 25 }, (_, index) => ({
    likelihood: (index % 5) + 1,
    impact: 5 - Math.floor(index / 5),
    count: index === 0 ? 1 : 0,
  })),
  comparison: {
    currentAuditId: '01a1cb40-c91b-71c2-99a3-ad0e551ccf4b',
    previousAuditId: '01a1cb40-c91b-71c2-99a3-ad0e551ccf4c',
    currentName: 'Audit 2026-Q4',
    previousName: 'Audit 2026-Q3',
    deviceDelta: 1,
    completenessDelta: 12,
    riskDeviceDelta: -1,
    findings: {
      currentTotal: 2,
      previousTotal: 3,
      opened: 1,
      closed: 1,
      carried: 1,
      stillOpen: 1,
      bySeverityCurrent: { LOW: 0, MEDIUM: 0, HIGH: 1, CRITICAL: 1 },
      bySeverityPrevious: { LOW: 0, MEDIUM: 1, HIGH: 1, CRITICAL: 1 },
      riskScoreCurrent: 16,
      riskScorePrevious: 20,
      newFindings: ['Remote access is not protected by MFA'],
      closedFindings: ['Default credentials may still be in use'],
    },
  },
  previousName: 'Audit 2026-Q3',
  comparisonSummary: ['Device inventory changed by +1 device(s).'],
  signature: [
    { role: 'Auditor', name: 'Demo Owner', date: '2026-11-16' },
    { role: 'Management body', name: ' ', date: ' ' },
  ],
  disclaimer: 'This tool supports compliance preparation and does not constitute legal advice.',
  legalReviewNotice:
    'Confirm the current national guidance and DNSC reporting channels before submitting this audit report.',
};

beforeAll(async () => {
  model.networkDiagram = {
    data: await sharp({
      create: { width: 600, height: 300, channels: 3, background: '#F8FAFC' },
    })
      .png()
      .toBuffer(),
    width: 600,
    height: 300,
  };
});

describe('audit report renderers', () => {
  it('renders an audit report DOCX with diagram, findings and heat map', async () => {
    const buffer = await renderAuditReportDocx(model);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(buffer.length).toBeGreaterThan(8_000);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')?.async('string');
    expect(xml).toContain('Network security audit');
    expect(xml).toContain('Remote access is not protected by MFA');
    expect(xml).toContain('Risk heat map');
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true);
  });

  it('renders an audit report PDF', async () => {
    const buffer = await renderAuditReportPdf(model);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(8_000);
  });
});
