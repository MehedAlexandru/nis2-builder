import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import type {
  ExportApprovalRow,
  ExportComplianceModel,
  ExportDocumentModel,
  ExportField,
  ExportRevisionRow,
} from './export-model';

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const PRIMARY = '#005AA3';
const PRIMARY_LIGHT = '#E6F0FA';
const BORDER = '#BFDBFE';
const TEXT = '#111827';
const MUTED = '#4B5563';
const WARNING = '#FEF3C7';
const DANGER = '#FEE2E2';
const SUCCESS = '#DCFCE7';

const FONT_CANDIDATES = {
  regular: [
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    'C:\\Windows\\Fonts\\arial.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
  ],
  bold: [
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    'C:\\Windows\\Fonts\\arialbd.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  ],
};

export async function renderDocumentPdf(model: ExportDocumentModel): Promise<Buffer> {
  return drawPdf((doc, fonts) => {
    drawDocCover(doc, fonts, model);
    doc.addPage();
    const tocPage = currentPage(doc);
    const entries: Array<{ title: string; page: number }> = [];
    doc.addPage();
    entries.push({ title: 'Document control', page: currentPage(doc) });
    drawHeading(doc, fonts, 'Document control', 1);
    drawMetaTable(doc, fonts, [
      ['Document ID', model.documentId],
      ['Version', model.versionLabel],
      ['Status', model.status],
      ['Classification', model.classification],
      ['Approval status', model.approvalStatus],
      ['Owner role', model.ownerRole],
      ['Weighted progress', `${model.progress}%`],
      ['Next review', model.nextReviewDate ? formatDate(model.nextReviewDate) : 'Not set'],
    ]);
    drawCallout(doc, fonts, model.legalReviewNotice, 'warning');
    drawCallout(doc, fonts, model.disclaimer, 'info');

    for (const section of model.sections) {
      doc.addPage();
      entries.push({ title: section.title, page: currentPage(doc) });
      drawHeading(doc, fonts, section.title, 2);
      for (const field of section.fields) {
        drawField(doc, fonts, field);
      }
    }

    doc.addPage();
    entries.push({ title: 'Legal references', page: currentPage(doc) });
    drawHeading(doc, fonts, 'Legal references', 2);
    drawParagraph(doc, fonts, model.legalReference, { bold: true });
    drawParagraph(
      doc,
      fonts,
      'Confirm the current national guidance and DNSC channel before submission.',
      { color: MUTED },
    );

    doc.addPage();
    entries.push({ title: 'Revision history', page: currentPage(doc) });
    drawHeading(doc, fonts, 'Revision history', 2);
    drawTable(
      doc,
      fonts,
      ['Revision', 'Date', 'Author', 'Change note', 'Changed fields'],
      model.revisionHistory.map((row: ExportRevisionRow) => [
        String(row.revisionNo),
        formatDate(row.date),
        row.author,
        row.changeNote || '—',
        row.changedFields,
      ]),
      [0.11, 0.16, 0.2, 0.37, 0.16],
    );

    doc.addPage();
    entries.push({ title: 'Approval and signature', page: currentPage(doc) });
    drawHeading(doc, fonts, 'Approval and signature', 2);
    drawApprovalBlock(doc, fonts, model.approvals);

    drawToc(doc, fonts, tocPage, entries);
    drawPageFurniture(doc, fonts, model.title, model.documentId);
  });
}

export async function renderCompliancePdf(model: ExportComplianceModel): Promise<Buffer> {
  return drawPdf((doc, fonts) => {
    drawComplianceCover(doc, fonts, model);
    doc.addPage();
    const tocPage = currentPage(doc);
    const entries = [
      { title: 'Compliance overview', page: 0 },
      { title: 'Document progress', page: 0 },
      { title: 'Outstanding items', page: 0 },
    ];
    doc.addPage();
    entries[0]!.page = currentPage(doc);
    drawHeading(doc, fonts, 'Compliance overview', 1);
    drawMetaTable(doc, fonts, [
      ['Classification', model.classificationLabel],
      ['Sector', model.sector],
      ['Size', model.sizeCategory],
      ['Jurisdiction pack', `${model.packCode}@${model.packVersion}`],
      ['Overall progress', `${model.overallProgress}%`],
      ['Required documents', `${model.completedCount} of ${model.requiredCount} complete`],
    ]);
    drawCallout(doc, fonts, model.legalReviewNotice, 'warning');
    drawCallout(doc, fonts, model.disclaimer, 'info');

    doc.addPage();
    entries[1]!.page = currentPage(doc);
    drawHeading(doc, fonts, 'Document progress', 1);
    drawTable(
      doc,
      fonts,
      ['Document', 'Legal reference', 'Required', 'Status', 'Progress', 'Version'],
      model.documents.map((row) => [
        row.title,
        row.legalReference,
        row.required ? 'Yes' : 'No',
        row.status,
        `${row.progress}%`,
        row.version,
      ]),
      [0.27, 0.26, 0.09, 0.13, 0.1, 0.15],
    );

    doc.addPage();
    entries[2]!.page = currentPage(doc);
    drawHeading(doc, fonts, 'Outstanding items', 1);
    if (model.outstandingItems.length === 0) {
      drawParagraph(doc, fonts, 'No outstanding required documents.');
    } else {
      for (const item of model.outstandingItems) {
        drawBullet(doc, fonts, item);
      }
    }

    drawToc(doc, fonts, tocPage, entries);
    drawPageFurniture(doc, fonts, 'NIS2 compliance summary', model.organizationName);
  });
}

interface FontSet {
  regular: string;
  bold: string;
}

function drawPdf(draw: (doc: PDFKit.PDFDocument, fonts: FontSet) => void): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
    bufferPages: true,
    info: { Author: 'NIS2 Compass', Creator: 'NIS2 Compass' },
  });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const regular = FONT_CANDIDATES.regular.find((path) => existsSync(path));
  const bold = FONT_CANDIDATES.bold.find((path) => existsSync(path));
  const fonts: FontSet = {
    regular: regular ? 'Body' : 'Helvetica',
    bold: bold ? 'Body-Bold' : 'Helvetica-Bold',
  };
  if (regular && bold) {
    doc.registerFont('Body', regular);
    doc.registerFont('Body-Bold', bold);
  }
  doc.font(fonts.regular).fillColor(TEXT);

  draw(doc, fonts);
  doc.end();
  return completed;
}

function drawDocCover(doc: PDFKit.PDFDocument, fonts: FontSet, model: ExportDocumentModel): void {
  doc.y = 90;
  if (model.logo) {
    try {
      doc.image(model.logo.data, PAGE_WIDTH / 2 - 70, doc.y, { fit: [140, 64], align: 'center' });
      doc.y += 90;
    } catch {
      doc.y += 10;
    }
  }
  doc.font(fonts.bold).fontSize(22).fillColor(PRIMARY).text(model.legalName, { align: 'center' });
  doc.moveDown(0.5);
  doc.font(fonts.bold).fontSize(30).fillColor(TEXT).text(model.title, { align: 'center' });
  doc.moveDown(0.6);
  doc.font(fonts.regular).fontSize(11).fillColor(MUTED).text(model.shortDescription, {
    align: 'center',
  });
  doc.moveDown(2);
  drawMetaTable(doc, fonts, [
    ['Document ID', model.documentId],
    ['Version', model.versionLabel],
    ['Classification', model.classification],
    ['Approval', model.approvalStatus],
    ['Generated', formatDate(model.generatedAt)],
    ['Legal reference', model.legalReference],
  ]);
  doc.moveDown(2);
  doc.font(fonts.regular).fontSize(9).fillColor(MUTED).text(model.organizationName, {
    align: 'center',
  });
}

function drawComplianceCover(
  doc: PDFKit.PDFDocument,
  fonts: FontSet,
  model: ExportComplianceModel,
): void {
  doc.y = 110;
  if (model.logo) {
    try {
      doc.image(model.logo.data, PAGE_WIDTH / 2 - 70, doc.y, { fit: [140, 64], align: 'center' });
      doc.y += 90;
    } catch {
      doc.y += 10;
    }
  }
  doc.font(fonts.bold).fontSize(22).fillColor(PRIMARY).text(model.legalName, { align: 'center' });
  doc.moveDown(0.6);
  doc.font(fonts.bold).fontSize(30).fillColor(TEXT).text('NIS2 compliance summary', {
    align: 'center',
  });
  doc.moveDown(0.6);
  doc
    .font(fonts.regular)
    .fontSize(11)
    .fillColor(MUTED)
    .text(`${model.classificationLabel} · ${model.packCode}@${model.packVersion}`, {
      align: 'center',
    });
  doc.moveDown(2);
  drawMetaTable(doc, fonts, [
    ['Generated', formatDate(model.generatedAt)],
    ['Overall progress', `${model.overallProgress}%`],
    ['Required complete', `${model.completedCount} of ${model.requiredCount}`],
  ]);
}

function drawHeading(doc: PDFKit.PDFDocument, fonts: FontSet, title: string, level: 1 | 2): void {
  ensureSpace(doc, level === 1 ? 54 : 44);
  doc
    .font(fonts.bold)
    .fontSize(level === 1 ? 20 : 15)
    .fillColor(PRIMARY)
    .text(title, { width: CONTENT_WIDTH });
  doc.moveDown(0.35);
  const y = doc.y;
  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_WIDTH - PAGE_MARGIN, y)
    .lineWidth(1)
    .strokeColor(BORDER)
    .stroke();
  doc.moveDown(0.6);
  doc.fillColor(TEXT);
}

function drawField(doc: PDFKit.PDFDocument, fonts: FontSet, field: ExportField): void {
  ensureSpace(doc, 40);
  if (field.kind === 'table') {
    drawLabel(doc, fonts, field.label, field.help);
    if (field.rows.length === 0) {
      drawParagraph(doc, fonts, 'No entries');
    } else {
      drawTable(
        doc,
        fonts,
        field.headers,
        field.rows.map((row) => row.cells),
      );
    }
    return;
  }

  if (field.kind === 'checklist') {
    drawLabel(doc, fonts, field.label, field.help);
    for (const item of field.items) {
      drawBullet(doc, fonts, `[${item.checked ? 'x' : ' '}] ${item.label}`);
    }
    return;
  }

  if (field.kind === 'multiSelect') {
    drawLabel(doc, fonts, field.label, field.help);
    drawParagraph(doc, fonts, field.values.length > 0 ? field.values.join(', ') : '—');
    return;
  }

  if (field.kind === 'riskMatrix') {
    drawLabel(doc, fonts, field.label, field.help);
    drawParagraph(
      doc,
      fonts,
      `Likelihood / impact: ${field.likelihood || '—'} / ${field.impact || '—'}   Score: ${field.score || '—'} (${field.rating})`,
    );
    drawRiskMatrix(doc, fonts, field.likelihood, field.impact);
    return;
  }

  if (field.kind === 'signature') {
    drawLabel(doc, fonts, field.label, field.help);
    drawParagraph(
      doc,
      fonts,
      `Name: ${field.name || '—'}   Role: ${field.role || '—'}   Date: ${field.date || '—'}`,
    );
    return;
  }

  drawLabel(doc, fonts, field.label, field.help);
  drawParagraph(doc, fonts, field.value);
}

function drawLabel(doc: PDFKit.PDFDocument, fonts: FontSet, label: string, help?: string): void {
  ensureSpace(doc, 28);
  doc.font(fonts.bold).fontSize(10).fillColor('#1F4E79').text(label, { width: CONTENT_WIDTH });
  if (help) {
    doc.font(fonts.regular).fontSize(8).fillColor(MUTED).text(help, { width: CONTENT_WIDTH });
  }
  doc.fillColor(TEXT);
}

function drawParagraph(
  doc: PDFKit.PDFDocument,
  fonts: FontSet,
  value: string,
  options: { bold?: boolean; color?: string; size?: number } = {},
): void {
  const text = value || '—';
  doc.font(options.bold ? fonts.bold : fonts.regular).fontSize(options.size ?? 10);
  const height = doc.heightOfString(text, { width: CONTENT_WIDTH });
  ensureSpace(doc, Math.min(height, PAGE_HEIGHT - PAGE_MARGIN * 2 - 40));
  doc.fillColor(options.color ?? TEXT).text(text, { width: CONTENT_WIDTH });
  doc.moveDown(0.5);
}

function drawBullet(doc: PDFKit.PDFDocument, fonts: FontSet, value: string): void {
  ensureSpace(doc, 20);
  doc
    .font(fonts.regular)
    .fontSize(10)
    .fillColor(TEXT)
    .text(`• ${value}`, {
      indent: 12,
      width: CONTENT_WIDTH - 12,
    });
}

function drawTable(
  doc: PDFKit.PDFDocument,
  fonts: FontSet,
  headers: string[],
  rows: string[][],
  weights?: number[],
): void {
  if (headers.length === 0) return;
  const normalized = headers.map((_, index) => weights?.[index] ?? 1 / headers.length);
  const widths = normalized.map((weight) => weight * CONTENT_WIDTH);
  const padding = 4;

  const drawHeader = (): void => {
    const height = Math.max(
      20,
      ...headers.map((header, index) => {
        doc.font(fonts.bold).fontSize(8);
        return (
          doc.heightOfString(header, { width: widthAt(widths, index) - padding * 2 }) + padding * 2
        );
      }),
    );
    const top = doc.y;
    doc.rect(PAGE_MARGIN, top, CONTENT_WIDTH, height).fill(PRIMARY);
    let x = PAGE_MARGIN;
    headers.forEach((header, index) => {
      const width = widthAt(widths, index);
      doc
        .fillColor('#FFFFFF')
        .font(fonts.bold)
        .fontSize(8)
        .text(header, x + padding, top + padding, {
          width: width - padding * 2,
        });
      x += width;
    });
    doc.y = top + height;
    doc.fillColor(TEXT);
  };

  ensureSpace(doc, 36);
  drawHeader();
  rows.forEach((row, rowIndex) => {
    const height = Math.max(
      18,
      ...row.map((cell, index) => {
        doc.font(fonts.regular).fontSize(8);
        return (
          doc.heightOfString(cell || '—', { width: widthAt(widths, index) - padding * 2 }) +
          padding * 2
        );
      }),
    );
    if (doc.y + height > PAGE_HEIGHT - PAGE_MARGIN - 30) {
      doc.addPage();
      drawHeader();
    }
    const top = doc.y;
    if (rowIndex % 2 === 1) {
      doc.rect(PAGE_MARGIN, top, CONTENT_WIDTH, height).fill(PRIMARY_LIGHT);
    }
    let x = PAGE_MARGIN;
    row.forEach((cell, index) => {
      const width = widthAt(widths, index);
      doc
        .fillColor(TEXT)
        .font(fonts.regular)
        .fontSize(8)
        .text(cell || '—', x + padding, top + padding, {
          width: width - padding * 2,
        });
      x += width;
    });
    doc
      .moveTo(PAGE_MARGIN, top + height)
      .lineTo(PAGE_WIDTH - PAGE_MARGIN, top + height)
      .lineWidth(0.5)
      .strokeColor(BORDER)
      .stroke();
    doc.y = top + height;
  });
  doc.moveDown(0.7);
}

function drawMetaTable(
  doc: PDFKit.PDFDocument,
  fonts: FontSet,
  rows: Array<[string, string]>,
): void {
  drawTable(
    doc,
    fonts,
    ['Field', 'Value'],
    rows.map(([label, value]) => [label, value]),
    [0.35, 0.65],
  );
}

function drawCallout(
  doc: PDFKit.PDFDocument,
  fonts: FontSet,
  value: string,
  variant: 'info' | 'warning' | 'danger' | 'success',
): void {
  const fill =
    variant === 'warning'
      ? WARNING
      : variant === 'danger'
        ? DANGER
        : variant === 'success'
          ? SUCCESS
          : PRIMARY_LIGHT;
  const textWidth = CONTENT_WIDTH - 20;
  doc.font(fonts.regular).fontSize(9);
  const height = doc.heightOfString(value, { width: textWidth }) + 18;
  ensureSpace(doc, height + 8);
  const top = doc.y;
  doc.rect(PAGE_MARGIN, top, CONTENT_WIDTH, height).fill(fill);
  doc.fillColor(TEXT).text(value, PAGE_MARGIN + 10, top + 9, { width: textWidth });
  doc.y = top + height + 8;
}

function drawRiskMatrix(
  doc: PDFKit.PDFDocument,
  fonts: FontSet,
  likelihood: number,
  impact: number,
): void {
  const cell = 22;
  const left = PAGE_MARGIN;
  const top = doc.y + 4;
  ensureSpace(doc, cell * 5 + 20);
  for (let l = 5; l >= 1; l -= 1) {
    for (let i = 1; i <= 5; i += 1) {
      const score = l * i;
      const x = left + (i - 1) * cell;
      const y = top + (5 - l) * cell;
      doc.rect(x, y, cell, cell).fill(riskColor(score)).stroke(BORDER);
      doc
        .fillColor(TEXT)
        .font(likelihood === i && impact === l ? fonts.bold : fonts.regular)
        .fontSize(7)
        .text(String(score), x, y + 6, { width: cell, align: 'center' });
    }
  }
  doc.y = top + cell * 5 + 10;
}

function drawApprovalBlock(
  doc: PDFKit.PDFDocument,
  fonts: FontSet,
  approvals: ExportApprovalRow[],
): void {
  if (approvals.length === 0) {
    drawParagraph(
      doc,
      fonts,
      'No approved version yet. The approval block populates when a version is approved.',
    );
  } else {
    drawTable(
      doc,
      fonts,
      ['Approver', 'Role', 'Date', 'Comment', 'Signature'],
      approvals.map((approval) => [
        approval.approver,
        approval.role || '—',
        formatDate(approval.date),
        approval.comment || '—',
        approval.signature || 'Signed electronically in NIS2 Compass',
      ]),
      [0.18, 0.16, 0.14, 0.32, 0.2],
    );
  }
  ensureSpace(doc, 60);
  const y = doc.y + 20;
  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + 190, y)
    .strokeColor(MUTED)
    .stroke();
  doc
    .moveTo(PAGE_WIDTH - PAGE_MARGIN - 190, y)
    .lineTo(PAGE_WIDTH - PAGE_MARGIN, y)
    .strokeColor(MUTED)
    .stroke();
  doc.font(fonts.regular).fontSize(8).fillColor(MUTED);
  doc.text('Signature', PAGE_MARGIN, y + 4, { width: 190, align: 'center' });
  doc.text('Date', PAGE_WIDTH - PAGE_MARGIN - 190, y + 4, { width: 190, align: 'center' });
  doc.y = y + 24;
}

function drawToc(
  doc: PDFKit.PDFDocument,
  fonts: FontSet,
  tocPage: number,
  entries: Array<{ title: string; page: number }>,
): void {
  doc.switchToPage(tocPage);
  doc.y = PAGE_MARGIN + 20;
  doc.font(fonts.bold).fontSize(20).fillColor(PRIMARY).text('Table of contents');
  doc.moveDown(0.8);
  entries.forEach((entry) => {
    const pageLabel = String(entry.page + 1);
    doc.font(fonts.regular).fontSize(10).fillColor(TEXT);
    const titleWidth = CONTENT_WIDTH - 40;
    doc.text(entry.title, PAGE_MARGIN, doc.y, { width: titleWidth, continued: true });
    doc.text(pageLabel, { align: 'right' });
  });
}

function drawPageFurniture(
  doc: PDFKit.PDFDocument,
  fonts: FontSet,
  title: string,
  identifier: string,
): void {
  const range = doc.bufferedPageRange();
  for (let index = 1; index < range.count; index += 1) {
    doc.switchToPage(index);
    doc.font(fonts.regular).fontSize(7).fillColor(MUTED);
    doc.text(title, PAGE_MARGIN, 24, { width: CONTENT_WIDTH - 150 });
    doc.text(identifier, PAGE_WIDTH - PAGE_MARGIN - 150, 24, { width: 150, align: 'right' });
    doc
      .moveTo(PAGE_MARGIN, 38)
      .lineTo(PAGE_WIDTH - PAGE_MARGIN, 38)
      .lineWidth(0.5)
      .strokeColor(BORDER)
      .stroke();
    doc.text(`NIS2 Compass · Page ${index + 1} of ${range.count}`, PAGE_MARGIN, PAGE_HEIGHT - 32, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
  }
  doc.switchToPage(range.start + range.count - 1);
}

function widthAt(widths: number[], index: number): number {
  return widths[index] ?? CONTENT_WIDTH;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > PAGE_HEIGHT - PAGE_MARGIN - 28) {
    doc.addPage();
  }
}

function currentPage(doc: PDFKit.PDFDocument): number {
  const range = doc.bufferedPageRange();
  return range.start + range.count - 1;
}

function riskColor(score: number): string {
  if (score >= 15) return DANGER;
  if (score >= 8) return WARNING;
  return SUCCESS;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
