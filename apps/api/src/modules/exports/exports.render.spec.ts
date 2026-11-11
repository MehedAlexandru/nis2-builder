import JSZip from 'jszip';
import type { ExportComplianceModel, ExportDocumentModel } from './export-model';
import { renderComplianceDocx, renderDocumentDocx } from './export-docx';
import { renderCompliancePdf, renderDocumentPdf } from './export-pdf';

const documentModel: ExportDocumentModel = {
  kind: 'document',
  organizationName: 'Demo SME SRL',
  legalName: 'Demo SME SRL',
  documentId: '01a1cb40-c91b-71c2-99a3-ad0e551ccf4b',
  templateKey: 'risk_management_policy',
  templateVersion: 1,
  title: 'Risk analysis methodology and register',
  shortDescription: 'Method, risk criteria and a maintained risk register.',
  legalReference: 'NIS2 Art. 21(2)(a)',
  ownerRole: 'CISO',
  classification: 'CONFIDENTIAL',
  status: 'COMPLETE',
  progress: 100,
  currentRevisionNo: 2,
  versionLabel: '1.0',
  versionStatus: 'APPROVED',
  approvalStatus: 'Approved',
  generatedAt: '2026-11-11T12:00:00.000Z',
  nextReviewDate: '2027-11-11T00:00:00.000Z',
  logo: null,
  sections: [
    {
      key: 'method',
      title: 'Methodology',
      fields: [
        { kind: 'richText', label: 'Risk analysis method', value: 'ISO/IEC 27005 aligned.' },
        { kind: 'select', label: 'Review cycle', value: 'Annual' },
        { kind: 'multiSelect', label: 'Frameworks', values: ['ISO 27001', 'CIS Controls'] },
        { kind: 'yesNo', label: 'Management approved', value: 'Yes' },
        {
          kind: 'table',
          label: 'Risk register',
          headers: ['Asset', 'Threat', 'Treatment'],
          rows: [{ cells: ['ERP', 'Outage', 'DR site'] }, { cells: ['Email', 'Phishing', 'MFA'] }],
        },
        {
          kind: 'checklist',
          label: 'Review checks',
          items: [
            { label: 'Owners assigned', checked: true },
            { label: 'Evidence attached', checked: false },
          ],
        },
        {
          kind: 'riskMatrix',
          label: 'Residual risk',
          likelihood: 2,
          impact: 3,
          score: 6,
          rating: 'Low risk',
        },
        {
          kind: 'signature',
          label: 'Approval',
          name: 'Demo Owner',
          role: 'CEO',
          date: '2026-11-11',
        },
        { kind: 'attachment', label: 'Evidence', value: 'Files are available in the platform.' },
      ],
    },
  ],
  revisionHistory: [
    {
      revisionNo: 1,
      date: '2026-11-10T10:00:00.000Z',
      author: 'Demo Owner',
      changeNote: 'Initial',
      changedFields: '4',
    },
    {
      revisionNo: 2,
      date: '2026-11-11T10:00:00.000Z',
      author: 'Demo Owner',
      changeNote: 'Review',
      changedFields: '2',
    },
  ],
  approvals: [
    {
      approver: 'Demo Owner',
      role: 'Management body',
      date: '2026-11-11T11:00:00.000Z',
      comment: 'Approved',
      signature: 'Demo Owner',
    },
  ],
  disclaimer: 'This tool supports compliance preparation and does not constitute legal advice.',
  legalReviewNotice: 'The Romanian document template is pending qualified legal review.',
};

const complianceModel: ExportComplianceModel = {
  kind: 'compliance',
  organizationName: 'Demo SME SRL',
  legalName: 'Demo SME SRL',
  generatedAt: '2026-11-11T12:00:00.000Z',
  logo: null,
  classificationResult: 'IMPORTANT',
  classificationLabel: 'Important entity',
  sector: 'ICT service management',
  sizeCategory: 'Medium',
  packCode: 'RO',
  packVersion: '0.2.0-draft',
  overallProgress: 42,
  requiredCount: 2,
  completedCount: 1,
  documents: [
    {
      key: 'governance_registration',
      title: 'Entity registration',
      legalReference: 'NIS2 Art. 3(4)',
      required: true,
      status: 'IN_PROGRESS',
      progress: 50,
      version: '0.1',
      outstanding: 2,
    },
    {
      key: 'risk_management_policy',
      title: 'Risk register',
      legalReference: 'NIS2 Art. 21(2)(a)',
      required: true,
      status: 'COMPLETE',
      progress: 100,
      version: '1.0',
      outstanding: 0,
    },
  ],
  outstandingItems: ['Entity registration: 2 required fields remaining'],
  disclaimer: 'This tool supports compliance preparation and does not constitute legal advice.',
  legalReviewNotice: 'The Romanian document template is pending qualified legal review.',
};

describe('professional export renderers', () => {
  it('renders a DOCX document with real styles and tables', async () => {
    const buffer = await renderDocumentDocx(documentModel);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(buffer.length).toBeGreaterThan(5_000);
    const zip = await JSZip.loadAsync(buffer);
    expect(zip.file('word/document.xml')).toBeTruthy();
    expect(zip.file('word/styles.xml')).toBeTruthy();
    const xml = await zip.file('word/document.xml')?.async('string');
    expect(xml).toContain('Risk analysis methodology and register');
    expect(xml).toContain('Risk register');
    expect(xml).toContain('Revision history');
  });

  it('renders a PDF document with the PDF signature', async () => {
    const buffer = await renderDocumentPdf(documentModel);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(5_000);
  });

  it('renders compliance summaries in both formats', async () => {
    const docx = await renderComplianceDocx(complianceModel);
    const pdf = await renderCompliancePdf(complianceModel);
    expect(docx.subarray(0, 2).toString()).toBe('PK');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
