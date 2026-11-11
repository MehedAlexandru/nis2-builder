import { LEGAL_DISCLAIMER, type ClassificationRun } from '@nis2/shared';
import PDFDocument from 'pdfkit';

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;
const PRIMARY = '#005AA3';
const PRIMARY_LIGHT = '#E6F0FA';
const TEXT = '#111827';
const MUTED = '#4B5563';
const BORDER = '#DBEAFE';

const outcomeColor: Record<ClassificationRun['result'], string> = {
  ESSENTIAL: '#B91C1C',
  IMPORTANT: '#B45309',
  LIKELY_IN_SCOPE: '#B45309',
  OUT_OF_SCOPE: '#047857',
};

const transliteration: Record<string, string> = {
  ă: 'a',
  â: 'a',
  î: 'i',
  ș: 's',
  ş: 's',
  ț: 't',
  ţ: 't',
  Ă: 'A',
  Â: 'A',
  Î: 'I',
  Ș: 'S',
  Ş: 'S',
  Ț: 'T',
  Ţ: 'T',
};

/** Standard PDF fonts are limited to WinAnsi; keep the Phase 2 summary readable. */
function safeText(value: string): string {
  return value.replace(/[ăâîșşțţĂÂÎȘŞȚŢ]/g, (character) => transliteration[character] ?? character);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number): string {
  return `EUR ${formatNumber(Math.round(value))}`;
}

export interface ClassificationPdfOptions {
  organizationName: string;
  packStatus: 'draft' | 'pending-legal-review' | 'verified';
  generatedAt: Date;
}

export function renderClassificationPdf(
  run: ClassificationRun,
  options: ClassificationPdfOptions,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
    bufferPages: true,
    info: {
      Title: 'NIS2 Compass — Entity classification summary',
      Author: 'NIS2 Compass',
      Subject: 'NIS2 entity classification result',
    },
  });

  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const ensureSpace = (needed: number): void => {
    if (doc.y + needed > doc.page.height - PAGE_MARGIN - 30) doc.addPage();
  };

  const heading = (title: string): void => {
    ensureSpace(38);
    doc.moveDown(0.7);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(PRIMARY).text(title, PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
    });
    const lineY = doc.y + 2;
    doc
      .moveTo(PAGE_MARGIN, lineY)
      .lineTo(595.28 - PAGE_MARGIN, lineY)
      .strokeColor(BORDER)
      .lineWidth(1)
      .stroke();
    doc.y = lineY + 8;
  };

  const paragraph = (value: string): void => {
    ensureSpace(28);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(TEXT)
      .text(safeText(value), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 2 });
    doc.moveDown(0.35);
  };

  const labelValue = (label: string, value: string): void => {
    ensureSpace(26);
    const y = doc.y;
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(MUTED)
      .text(safeText(label), PAGE_MARGIN, y, { width: 145 });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(TEXT)
      .text(safeText(value), PAGE_MARGIN + 150, y, { width: CONTENT_WIDTH - 150 });
    doc.y = Math.max(doc.y, y + 14);
    doc.moveDown(0.25);
  };

  const tableRow = (cells: string[], options?: { header?: boolean }): void => {
    ensureSpace(22);
    const y = doc.y;
    const columnX = [PAGE_MARGIN, PAGE_MARGIN + 150, PAGE_MARGIN + 245, PAGE_MARGIN + 365];
    const columnWidth = [145, 90, 115, 110];
    if (options?.header) {
      doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 18).fill(PRIMARY_LIGHT);
    }
    cells.forEach((cell, index) => {
      doc
        .font(options?.header ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .fillColor(options?.header ? PRIMARY : TEXT)
        .text(safeText(cell), columnX[index] ?? PAGE_MARGIN, y + 5, {
          width: columnWidth[index] ?? 100,
        });
    });
    doc.y = y + 20;
  };

  // Header band.
  doc.rect(0, 0, 595.28, 86).fill(PRIMARY);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(20)
    .text('NIS2 Compass', PAGE_MARGIN, 26);
  doc.font('Helvetica').fontSize(11).text('Entity classification summary', PAGE_MARGIN, 54);
  doc.y = 106;

  const bannerY = doc.y;
  doc.roundedRect(PAGE_MARGIN, bannerY, CONTENT_WIDTH, 46, 6).fill(outcomeColor[run.result]);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(safeText(run.consequences.heading.en), PAGE_MARGIN + 16, bannerY + 14, {
      width: CONTENT_WIDTH - 32,
    });
  doc.y = bannerY + 58;

  labelValue('Organization', options.organizationName);
  labelValue(
    'Generated at',
    options.generatedAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  );
  labelValue('Classification version', `v${run.version}`);
  labelValue('Jurisdiction pack', `${run.jurisdictionPackCode} ${run.jurisdictionPackVersion}`);
  if (options.packStatus === 'pending-legal-review') {
    paragraph(
      'Romanian jurisdiction content is pending legal review. Confirm the result and the national registration duties with DNSC or a qualified lawyer.',
    );
  }

  heading('Selected entity and size');
  labelValue('Sector', `${run.selection.sectorName.en} (Annex ${run.selection.annex ?? '-'})`);
  labelValue('Subsector', run.selection.subsectorName.en);
  labelValue('Entity type', run.selection.entityTypeName.en);
  labelValue('Establishment', run.summary.establishmentCountries.join(', '));
  labelValue('Consolidated size', `${run.size.category} (Recommendation 2003/361/EC)`);

  tableRow(['Data source', 'Employees', 'Turnover', 'Balance sheet'], { header: true });
  tableRow([
    'Own enterprise',
    formatNumber(run.size.own.employees),
    formatMoney(run.size.own.annualTurnoverEur),
    formatMoney(run.size.own.balanceSheetTotalEur),
  ]);
  if (run.size.linked.employees > 0) {
    tableRow([
      'Linked enterprises (100%)',
      formatNumber(run.size.linked.employees),
      formatMoney(run.size.linked.annualTurnoverEur),
      formatMoney(run.size.linked.balanceSheetTotalEur),
    ]);
  }
  if (run.size.partners.employees > 0) {
    tableRow([
      'Partner enterprises (pro rata)',
      formatNumber(run.size.partners.employees),
      formatMoney(run.size.partners.annualTurnoverEur),
      formatMoney(run.size.partners.balanceSheetTotalEur),
    ]);
  }
  tableRow([
    'Consolidated total',
    formatNumber(run.size.total.employees),
    formatMoney(run.size.total.annualTurnoverEur),
    formatMoney(run.size.total.balanceSheetTotalEur),
  ]);

  heading('Consequences');
  labelValue(
    'Supervision',
    `${run.consequences.supervision.en} (${run.consequences.supervisionCitation})`,
  );
  labelValue(
    'Fines',
    `${run.consequences.fines.description.en} (${run.consequences.fines.citation})`,
  );
  labelValue('Management liability', run.consequences.managementLiability.en);
  labelValue('Registration', run.consequences.registration.en);
  labelValue('Incident reporting', run.consequences.reporting.en);

  const requiredDocuments = run.applicability.filter((document) => document.required);
  heading(
    requiredDocuments.length > 0
      ? 'Required document checklist'
      : 'Suggested good-practice documents',
  );
  if (run.applicability.length === 0) {
    paragraph('No document applicability was stored for this run.');
  } else {
    for (const document of run.applicability) {
      ensureSpace(26);
      paragraph(
        `${document.priority}. ${document.title.en}${document.required ? ' (required)' : ' (voluntary)'}`,
      );
    }
  }

  heading('Legal basis');
  for (const entry of run.legalBasis) {
    paragraph(`${entry.citation}${entry.note ? ` — ${entry.note}` : ''}`);
  }

  heading('Legal notice');
  paragraph(LEGAL_DISCLAIMER.en);
  paragraph(
    'This summary is generated from the answers recorded in the application and the cited jurisdiction pack version. It is not a legal opinion and does not replace advice from the competent authority or a qualified lawyer.',
  );

  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `NIS2 Compass · ${run.jurisdictionPackCode}@${run.jurisdictionPackVersion} · Page ${
          page - range.start + 1
        } / ${range.count}`,
        PAGE_MARGIN,
        doc.page.height - 38,
        { width: CONTENT_WIDTH, align: 'center' },
      );
  }

  doc.end();
  return completed;
}
