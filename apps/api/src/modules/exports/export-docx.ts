import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type {
  ExportApprovalRow,
  ExportComplianceModel,
  ExportDocumentModel,
  ExportField,
  ExportRevisionRow,
} from './export-model';
import type { AuditReportModel } from './audit-report-model';

const PRIMARY = '005AA3';
const PRIMARY_LIGHT = 'E6F0FA';
const BORDER = 'BFDBFE';
const TEXT = '111827';
const MUTED = '4B5563';
const WARNING = 'FEF3C7';
const DANGER = 'FEE2E2';
const SUCCESS = 'DCFCE7';

const borders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  left: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  right: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
};

export async function renderDocumentDocx(model: ExportDocumentModel): Promise<Buffer> {
  const children = [
    ...cover(model),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Document control')] }),
    controlTable(model),
    new Paragraph({ children: [new TextRun({ text: '', size: 20 })] }),
    callout(model.legalReviewNotice, 'warning'),
    callout(model.disclaimer, 'info'),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Table of contents')],
    }),
    new TableOfContents('Table of contents', { hyperlink: true }),
    new Paragraph({ children: [new PageBreak()] }),
    ...model.sections.flatMap((section) => [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(section.title)],
      }),
      ...section.fields.flatMap((field) => fieldBlocks(field)),
    ]),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun('Legal references')],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: model.legalReference, bold: true }),
        new TextRun({
          text: ' — confirm the current national guidance before submission.',
          color: MUTED,
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun('Revision history')],
    }),
    revisionTable(model.revisionHistory),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun('Approval and signature')],
    }),
    ...approvalTable(model),
    callout(model.disclaimer, 'info'),
  ];

  const document = new Document({
    creator: 'NIS2 Compass',
    features: { updateFields: true },
    title: model.title,
    description: model.shortDescription,
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 21, color: TEXT },
          paragraph: { spacing: { after: 120 } },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 30, bold: true, color: PRIMARY, font: 'Arial' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 25, bold: true, color: PRIMARY, font: 'Arial' },
          paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 22, bold: true, color: '1F4E79', font: 'Arial' },
          paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 850, right: 850, bottom: 850, left: 850 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: model.title, color: MUTED, size: 16 }),
                  new TextRun({ text: `  ·  ${model.documentId}`, color: MUTED, size: 16 }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'NIS2 Compass · ', color: MUTED, size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 16 }),
                  new TextRun({ text: ' / ', color: MUTED, size: 16 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], color: MUTED, size: 16 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

export async function renderComplianceDocx(model: ExportComplianceModel): Promise<Buffer> {
  const document = new Document({
    creator: 'NIS2 Compass',
    features: { updateFields: true },
    title: 'NIS2 compliance summary',
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 21, color: TEXT },
          paragraph: { spacing: { after: 120 } },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 30, bold: true, color: PRIMARY, font: 'Arial' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 25, bold: true, color: PRIMARY, font: 'Arial' },
          paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 850, right: 850, bottom: 850, left: 850 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'NIS2 Compass · ', color: MUTED, size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 16 }),
                ],
              }),
            ],
          }),
        },
        children: [
          ...complianceCover(model),
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun('Compliance overview')],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Classification: ', bold: true }),
              new TextRun(model.classificationLabel),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Sector / size: ', bold: true }),
              new TextRun(`${model.sector} · ${model.sizeCategory}`),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Overall documentation progress: ', bold: true }),
              new TextRun(`${model.overallProgress}%`),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Required documents complete: ', bold: true }),
              new TextRun(`${model.completedCount} of ${model.requiredCount}`),
            ],
          }),
          callout(model.legalReviewNotice, 'warning'),
          callout(model.disclaimer, 'info'),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun('Document progress')],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders,
            rows: [
              headerRow([
                'Document',
                'Legal reference',
                'Required',
                'Status',
                'Progress',
                'Version',
              ]),
              ...model.documents.map(
                (row, index) =>
                  new TableRow({
                    children: [
                      cell(row.title, index),
                      cell(row.legalReference, index),
                      cell(row.required ? 'Yes' : 'No', index),
                      cell(row.status, index),
                      cell(`${row.progress}%`, index),
                      cell(row.version, index),
                    ],
                  }),
              ),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun('Outstanding items')],
          }),
          ...(model.outstandingItems.length === 0
            ? [new Paragraph({ children: [new TextRun('No outstanding required documents.')] })]
            : model.outstandingItems.map(
                (item) =>
                  new Paragraph({
                    bullet: { level: 0 },
                    children: [new TextRun(item)],
                  }),
              )),
        ],
      },
    ],
  });

  return Packer.toBuffer(document);
}

function cover(model: ExportDocumentModel): (Paragraph | Table)[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '', size: 24 })],
    }),
    ...(model.logo ? [logoParagraph(model.logo)] : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: model.legalName, size: 32, bold: true, color: PRIMARY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [new TextRun({ text: model.title, size: 44, bold: true, color: TEXT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [new TextRun({ text: model.shortDescription, size: 22, color: MUTED })],
    }),
    new Table({
      alignment: AlignmentType.CENTER,
      width: { size: 70, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        metaRow('Document ID', model.documentId),
        metaRow('Version', model.versionLabel),
        metaRow('Classification', model.classification),
        metaRow('Approval status', model.approvalStatus),
        metaRow('Generated', formatDate(model.generatedAt)),
        metaRow('Legal reference', model.legalReference),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      children: [new TextRun({ text: model.organizationName, color: MUTED, size: 20 })],
    }),
  ];
}

function complianceCover(model: ExportComplianceModel): (Paragraph | Table)[] {
  return [
    ...(model.logo ? [logoParagraph(model.logo)] : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 360, after: 120 },
      children: [new TextRun({ text: model.legalName, size: 32, bold: true, color: PRIMARY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'NIS2 compliance summary', size: 44, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [
        new TextRun({
          text: `${model.classificationLabel} · ${model.packCode}@${model.packVersion}`,
          size: 22,
          color: MUTED,
        }),
      ],
    }),
    new Table({
      alignment: AlignmentType.CENTER,
      width: { size: 70, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        metaRow('Generated', formatDate(model.generatedAt)),
        metaRow('Overall progress', `${model.overallProgress}%`),
        metaRow('Required complete', `${model.completedCount} of ${model.requiredCount}`),
      ],
    }),
  ];
}

function logoParagraph(logo: { data: Buffer; mimeType: string }): Paragraph {
  const type = logo.mimeType === 'image/png' ? 'png' : 'jpg';
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        data: logo.data,
        type,
        transformation: { width: 150, height: 60 },
        altText: { name: 'Company logo', description: 'Company logo' },
      }),
    ],
  });
}

function controlTable(model: ExportDocumentModel): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      metaRow('Owner role', model.ownerRole),
      metaRow('Status', model.status),
      metaRow('Weighted progress', `${model.progress}%`),
      metaRow('Current revision', String(model.currentRevisionNo)),
      metaRow('Version', `${model.versionLabel} (${model.versionStatus})`),
      metaRow('Next review', model.nextReviewDate ? formatDate(model.nextReviewDate) : 'Not set'),
    ],
  });
}

function fieldBlocks(field: ExportField): Array<Paragraph | Table> {
  if (field.kind === 'table') {
    if (field.rows.length === 0) return [labelValue(field.label, 'No entries', field.help)];
    return [
      labelParagraph(field.label, field.help),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders,
        rows: [
          headerRow(field.headers),
          ...field.rows.map(
            (row, index) =>
              new TableRow({
                children: row.cells.map((value) => cell(value, index)),
              }),
          ),
        ],
      }),
      spacing(),
    ];
  }

  if (field.kind === 'checklist') {
    return [
      labelParagraph(field.label, field.help),
      ...field.items.map(
        (item) =>
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: `[${item.checked ? 'x' : ' '}] `, bold: true }),
              new TextRun(item.label),
            ],
          }),
      ),
    ];
  }

  if (field.kind === 'multiSelect') {
    return [
      labelValue(field.label, field.values.length ? field.values.join(', ') : '—', field.help),
    ];
  }

  if (field.kind === 'riskMatrix') {
    return [
      labelParagraph(field.label, field.help),
      new Paragraph({
        children: [
          new TextRun({ text: 'Likelihood / impact: ', bold: true }),
          new TextRun(`${field.likelihood || '—'} / ${field.impact || '—'}`),
          new TextRun({ text: '   Score: ', bold: true }),
          new TextRun(`${field.score || '—'} (${field.rating})`),
        ],
      }),
      riskTable(field.likelihood, field.impact),
      spacing(),
    ];
  }

  if (field.kind === 'signature') {
    return [
      labelParagraph(field.label, field.help),
      new Paragraph({
        children: [
          new TextRun({ text: 'Name: ', bold: true }),
          new TextRun(field.name || '—'),
          new TextRun({ text: '   Role: ', bold: true }),
          new TextRun(field.role || '—'),
          new TextRun({ text: '   Date: ', bold: true }),
          new TextRun(field.date || '—'),
        ],
      }),
      spacing(),
    ];
  }

  if (field.kind === 'attachment') {
    return [labelValue(field.label, field.value, field.help)];
  }

  return [labelValue(field.label, field.value, field.help)];
}

function riskTable(likelihood: number, impact: number): Table {
  const rows: TableRow[] = [];
  for (let l = 5; l >= 1; l -= 1) {
    const cells: TableCell[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const score = l * i;
      const selected = likelihood === i && impact === l;
      cells.push(
        new TableCell({
          shading: { fill: riskColor(score), type: ShadingType.CLEAR, color: 'auto' },
          borders,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: String(score), bold: selected })],
            }),
          ],
        }),
      );
    }
    rows.push(new TableRow({ children: cells }));
  }
  return new Table({
    width: { size: 80, type: WidthType.PERCENTAGE },
    borders,
    rows,
  });
}

function revisionTable(rows: ExportRevisionRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      headerRow(['Revision', 'Date', 'Author', 'Change note', 'Changed fields']),
      ...rows.map(
        (row, index) =>
          new TableRow({
            children: [
              cell(String(row.revisionNo), index),
              cell(formatDate(row.date), index),
              cell(row.author, index),
              cell(row.changeNote || '—', index),
              cell(row.changedFields, index),
            ],
          }),
      ),
    ],
  });
}

function approvalTable(model: ExportDocumentModel): (Table | Paragraph)[] {
  if (model.approvals.length === 0) {
    return [
      new Paragraph({
        children: [
          new TextRun(
            'No approved version yet. The approval block will populate when a version is approved.',
          ),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Signature: ____________________    Date: ______________',
            color: MUTED,
          }),
        ],
      }),
    ];
  }
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        headerRow(['Approver', 'Role', 'Date', 'Comment', 'Signature']),
        ...model.approvals.map(
          (row: ExportApprovalRow, index: number) =>
            new TableRow({
              children: [
                cell(row.approver, index),
                cell(row.role || '—', index),
                cell(formatDate(row.date), index),
                cell(row.comment || '—', index),
                cell(row.signature || 'Signed electronically in NIS2 Compass', index),
              ],
            }),
        ),
      ],
    }),
  ];
}

function labelParagraph(label: string, help?: string): Paragraph {
  return new Paragraph({
    spacing: { before: 180, after: 60 },
    children: [
      new TextRun({ text: label, bold: true, color: '1F4E79' }),
      ...(help ? [new TextRun({ text: `  ${help}`, color: MUTED, size: 18, italics: true })] : []),
    ],
  });
}

function labelValue(label: string, value: string, help?: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, color: '1F4E79' }),
      new TextRun({ text: value }),
      ...(help ? [new TextRun({ text: `  ${help}`, color: MUTED, size: 18, italics: true })] : []),
    ],
  });
}

function metaRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        shading: { fill: PRIMARY_LIGHT, type: ShadingType.CLEAR, color: 'auto' },
        borders,
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        borders,
        children: [new Paragraph(value)],
      }),
    ],
  });
}

function headerRow(values: string[]): TableRow {
  return new TableRow({
    tableHeader: true,
    children: values.map(
      (value) =>
        new TableCell({
          shading: { fill: PRIMARY, type: ShadingType.CLEAR, color: 'auto' },
          borders,
          children: [
            new Paragraph({
              children: [new TextRun({ text: value, bold: true, color: 'FFFFFF' })],
            }),
          ],
        }),
    ),
  });
}

function cell(value: string, index: number): TableCell {
  return new TableCell({
    shading:
      index % 2 === 1 ? { fill: PRIMARY_LIGHT, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    borders,
    children: value.split('\n').map((line) => new Paragraph(line)),
  });
}

function callout(value: string, variant: 'info' | 'warning' | 'danger' | 'success'): Table {
  const fill =
    variant === 'warning'
      ? WARNING
      : variant === 'danger'
        ? DANGER
        : variant === 'success'
          ? SUCCESS
          : PRIMARY_LIGHT;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
            borders,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: value })] })],
          }),
        ],
      }),
    ],
  });
}

function spacing(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: '', size: 8 })] });
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

export async function renderAuditReportDocx(model: AuditReportModel): Promise<Buffer> {
  const diagramRatio = model.networkDiagram.height / model.networkDiagram.width;
  const diagramWidth = 620;
  const diagramHeight = Math.min(420, Math.round(diagramWidth * diagramRatio));
  const children: Array<Paragraph | Table | TableOfContents> = [
    ...auditCover(model),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Table of contents')],
    }),
    new TableOfContents('Table of contents', { hyperlink: true }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Executive summary')],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        metaRow('Audit', `${model.auditName} (${model.period})`),
        metaRow('Status', model.status),
        metaRow('Devices documented', String(model.deviceCount)),
        metaRow('Device information complete', `${model.completeCount} of ${model.deviceCount}`),
        metaRow('Average completeness', `${model.averageCompleteness}%`),
        metaRow('Devices with risks', String(model.riskDeviceCount)),
        metaRow(
          'Open findings',
          `${model.openFindings} (${model.criticalFindings} critical, ${model.highFindings} high)`,
        ),
        metaRow('Open risk score', String(model.riskScore)),
      ],
    }),
    spacing(),
    callout(model.legalReviewNotice, 'warning'),
    callout(model.disclaimer, 'info'),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Scope and methodology')],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        metaRow('Scope', model.scope),
        metaRow('Methodology', model.methodology),
        metaRow('Auditor', model.auditorName),
        metaRow('Limitations', model.limitations),
        metaRow('Period', model.period),
        metaRow('Closed', model.closedAt ? formatDate(model.closedAt) : 'Not closed'),
      ],
    }),
    spacing(),
    ...(model.comparisonSummary.length > 0
      ? [
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun('Comparison with the previous audit')],
          }),
          ...model.comparisonSummary.map(bullet),
        ]
      : []),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Network diagram')],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'The diagram is generated from the documented zones, devices and connections. It reflects the saved map layout and is not a live network scan.',
          color: MUTED,
          size: 18,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          data: model.networkDiagram.data,
          type: 'png',
          transformation: { width: diagramWidth, height: diagramHeight },
          altText: {
            name: 'Network diagram',
            description: `Network diagram for ${model.auditName}`,
          },
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Device inventory')],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        headerRow(['Device', 'Type', 'IP', 'Zone', 'Complete', 'Risks']),
        ...model.devices.map(
          (device, index) =>
            new TableRow({
              children: [
                cell(device.name, index),
                cell(device.type, index),
                cell(device.ipAddresses, index),
                cell(device.zone, index),
                cell(`${device.completeness}%`, index),
                cell(device.risks, index),
              ],
            }),
        ),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Per-device sheets')],
    }),
    ...model.devices.flatMap((device) => [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(device.name)],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders,
        rows: [
          metaRow('Type', device.type),
          metaRow('IP addresses', device.ipAddresses),
          metaRow('MAC address', device.macAddress),
          metaRow('Zone', device.zone),
          metaRow('Criticality', device.criticality),
          metaRow('Completeness', `${device.completeness}%`),
          metaRow('Scan state', device.scanState),
          metaRow('Risk indicators', device.risks),
        ],
      }),
      spacing(),
    ]),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Findings and remediation')],
    }),
    ...(model.findings.length === 0
      ? [new Paragraph('No findings were recorded for this audit.')]
      : [
          new Paragraph({
            children: [
              new TextRun({
                text: 'Findings are sorted by severity and risk score. Colours indicate the severity band.',
                color: MUTED,
                size: 18,
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders,
            rows: [
              headerRow(['Code', 'Finding', 'Severity', 'Status', 'Risk', 'Owner', 'Due']),
              ...model.findings.map(
                (finding, index) =>
                  new TableRow({
                    children: [
                      cell(finding.code, index),
                      cell(finding.title, index),
                      severityCell(finding.severity),
                      cell(finding.status, index),
                      cell(finding.riskScore, index),
                      cell(finding.owner, index),
                      cell(finding.dueDate, index),
                    ],
                  }),
              ),
            ],
          }),
        ]),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('NIS2 Art. 21 mapping')],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        headerRow(['Measure', 'Legal reference', 'Open findings', 'Highest severity']),
        ...model.art21.map(
          (row, index) =>
            new TableRow({
              children: [
                cell(row.category, index),
                cell(row.legalReference, index),
                cell(String(row.count), index),
                cell(row.highestSeverity, index),
              ],
            }),
        ),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Remediation roadmap')],
    }),
    ...model.roadmap.flatMap((group) => [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(group.title)],
      }),
      ...(group.items.length === 0
        ? [
            new Paragraph({
              children: [new TextRun({ text: 'No findings in this window.', color: MUTED })],
            }),
          ]
        : group.items.map(bullet)),
    ]),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Risk heat map')],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'Likelihood and impact are taken from each finding; findings without a score use the severity default.',
          color: MUTED,
          size: 18,
        }),
      ],
    }),
    heatMapTable(model),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Comparison with the previous audit')],
    }),
    ...(model.comparison
      ? [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders,
            rows: [
              metaRow('Previous audit', model.previousName ?? '-'),
              metaRow('Findings opened', String(model.comparison.findings.opened)),
              metaRow('Findings closed', String(model.comparison.findings.closed)),
              metaRow('Findings carried forward', String(model.comparison.findings.carried)),
              metaRow('Still open from previous', String(model.comparison.findings.stillOpen)),
              metaRow(
                'Risk score change',
                String(
                  model.comparison.findings.riskScoreCurrent -
                    model.comparison.findings.riskScorePrevious,
                ),
              ),
              metaRow('Device change', String(model.comparison.deviceDelta)),
              metaRow('Completeness change', `${model.comparison.completenessDelta} points`),
            ],
          }),
          spacing(),
          ...model.comparisonSummary.map(bullet),
        ]
      : [new Paragraph('No previous audit was selected for comparison.')]),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Signature and appendices')],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'This report was generated from the network inventory, device assessments and findings recorded in NIS2 Compass. It is an inventory-based assessment, not a penetration test.',
          color: MUTED,
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        headerRow(['Role', 'Name', 'Date']),
        ...model.signature.map(
          (row, index) =>
            new TableRow({
              children: [
                cell(row.role, index),
                cell(row.name || ' ', index),
                cell(row.date || ' ', index),
              ],
            }),
        ),
      ],
    }),
    spacing(),
    callout(model.disclaimer, 'info'),
  ];

  const document = new Document({
    creator: 'NIS2 Compass',
    features: { updateFields: true },
    title: `${model.auditName} - network security audit`,
    description: `Network security audit report for ${model.organizationName}`,
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 21, color: TEXT },
          paragraph: { spacing: { after: 120 } },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 30, bold: true, color: PRIMARY, font: 'Arial' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 25, bold: true, color: PRIMARY, font: 'Arial' },
          paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 850, right: 850, bottom: 850, left: 850 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Network security audit', color: MUTED, size: 16 }),
                  new TextRun({ text: `  |  ${model.auditName}`, color: MUTED, size: 16 }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'NIS2 Compass  |  ', color: MUTED, size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 16 }),
                  new TextRun({ text: ' / ', color: MUTED, size: 16 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], color: MUTED, size: 16 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}

function auditCover(model: AuditReportModel): Array<Paragraph | Table> {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '', size: 24 })],
    }),
    ...(model.logo ? [logoParagraph(model.logo)] : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: model.legalName, size: 32, bold: true, color: PRIMARY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'Network security audit', size: 44, bold: true, color: TEXT }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: model.auditName, size: 28, bold: true, color: TEXT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [new TextRun({ text: model.period, size: 22, color: MUTED })],
    }),
    new Table({
      alignment: AlignmentType.CENTER,
      width: { size: 70, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        metaRow('Status', model.status),
        metaRow('Auditor', model.auditorName),
        metaRow('Generated', formatDate(model.generatedAt)),
        metaRow('Closed', model.closedAt ? formatDate(model.closedAt) : 'Not closed'),
        metaRow('Devices', String(model.deviceCount)),
        metaRow('Open findings', String(model.openFindings)),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      children: [new TextRun({ text: model.organizationName, color: MUTED, size: 20 })],
    }),
  ];
}

function bullet(value: string): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, children: [new TextRun(value)] });
}

function severityCell(severity: string): TableCell {
  const fill =
    severity === 'CRITICAL'
      ? DANGER
      : severity === 'HIGH'
        ? 'FFEDD5'
        : severity === 'MEDIUM'
          ? WARNING
          : SUCCESS;
  return new TableCell({
    shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
    borders,
    children: [new Paragraph({ children: [new TextRun({ text: severity, bold: true })] })],
  });
}

function heatMapTable(model: AuditReportModel): Table {
  const rows = [];
  rows.push(headerRow(['Impact \\ Likelihood', '1', '2', '3', '4', '5']));
  for (let impact = 5; impact >= 1; impact -= 1) {
    const cells = [
      new TableCell({
        shading: { fill: PRIMARY_LIGHT, type: ShadingType.CLEAR, color: 'auto' },
        borders,
        children: [
          new Paragraph({ children: [new TextRun({ text: String(impact), bold: true })] }),
        ],
      }),
    ];
    for (let likelihood = 1; likelihood <= 5; likelihood += 1) {
      const value = likelihood * impact;
      const count =
        model.heatMap.find((entry) => entry.likelihood === likelihood && entry.impact === impact)
          ?.count ?? 0;
      const fill = value >= 15 ? DANGER : value >= 8 ? WARNING : SUCCESS;
      cells.push(
        new TableCell({
          shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
          borders,
          children: [new Paragraph(`${value} (${count})`)],
        }),
      );
    }
    rows.push(new TableRow({ children: cells }));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, rows });
}
