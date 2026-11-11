import type {
  Approval,
  CompanyProfile,
  Document,
  DocumentRevision,
  DocumentTemplate,
  DocumentVersion,
  Organization,
  Prisma,
  User,
} from '@prisma/client';
import {
  calculateDocumentProgress,
  calculateEnterpriseSize,
  classificationAnswersSchema,
  documentApplicabilitySchema,
  documentStatusFromProgress,
  documentTemplateSchema,
  getClassificationPack,
  resolveSelection,
  type DocumentField,
  type DocumentPayload,
  type DocumentStatus,
  type DocumentTemplate as SharedDocumentTemplate,
  type LocalizedText,
} from '@nis2/shared';
import { z } from 'zod';

export type ExportLocale = 'en' | 'ro';

export interface ExportLogo {
  data: Buffer;
  mimeType: string;
}

export interface ExportTableRow {
  cells: string[];
}

export type ExportField =
  | { kind: 'text'; label: string; value: string; help?: string }
  | { kind: 'richText'; label: string; value: string; help?: string }
  | { kind: 'select'; label: string; value: string; help?: string }
  | { kind: 'multiSelect'; label: string; values: string[]; help?: string }
  | { kind: 'yesNo'; label: string; value: string; help?: string }
  | { kind: 'table'; label: string; headers: string[]; rows: ExportTableRow[]; help?: string }
  | {
      kind: 'checklist';
      label: string;
      items: Array<{ label: string; checked: boolean }>;
      help?: string;
    }
  | {
      kind: 'riskMatrix';
      label: string;
      likelihood: number;
      impact: number;
      score: number;
      rating: string;
      help?: string;
    }
  | { kind: 'signature'; label: string; name: string; role: string; date: string; help?: string }
  | { kind: 'attachment'; label: string; value: string; help?: string };

export interface ExportSection {
  key: string;
  title: string;
  fields: ExportField[];
}

export interface ExportRevisionRow {
  revisionNo: number;
  date: string;
  author: string;
  changeNote: string;
  changedFields: string;
}

export interface ExportApprovalRow {
  approver: string;
  role: string;
  date: string;
  comment: string;
  signature: string;
}

export interface ExportDocumentModel {
  kind: 'document';
  organizationName: string;
  legalName: string;
  documentId: string;
  templateKey: string;
  templateVersion: number;
  title: string;
  shortDescription: string;
  legalReference: string;
  ownerRole: string;
  classification: string;
  status: string;
  progress: number;
  currentRevisionNo: number;
  versionLabel: string;
  versionStatus: string;
  approvalStatus: string;
  generatedAt: string;
  nextReviewDate: string | null;
  logo: ExportLogo | null;
  sections: ExportSection[];
  revisionHistory: ExportRevisionRow[];
  approvals: ExportApprovalRow[];
  disclaimer: string;
  legalReviewNotice: string;
}

export interface ExportComplianceDocumentRow {
  key: string;
  title: string;
  legalReference: string;
  required: boolean;
  status: string;
  progress: number;
  version: string;
  outstanding: number;
}

export interface ExportComplianceModel {
  kind: 'compliance';
  organizationName: string;
  legalName: string;
  generatedAt: string;
  logo: ExportLogo | null;
  classificationResult: string;
  classificationLabel: string;
  sector: string;
  sizeCategory: string;
  packCode: string;
  packVersion: string;
  overallProgress: number;
  requiredCount: number;
  completedCount: number;
  documents: ExportComplianceDocumentRow[];
  outstandingItems: string[];
  disclaimer: string;
  legalReviewNotice: string;
}

export interface DocumentModelInput {
  document: Document & { template: DocumentTemplate };
  organization: Organization;
  profile: CompanyProfile | null;
  revisions: Array<DocumentRevision & { createdBy: User }>;
  versions: Array<
    DocumentVersion & {
      createdBy: User | null;
      approvals: Array<Approval & { approver: User }>;
    }
  >;
  logo: ExportLogo | null;
  locale: ExportLocale;
}

export interface ComplianceModelInput {
  organization: Organization;
  profile: CompanyProfile | null;
  templates: DocumentTemplate[];
  documents: Array<Document & { template: DocumentTemplate }>;
  latestRun: {
    result: string;
    inputs: Prisma.JsonValue;
    applicability: Prisma.JsonValue | null;
    jurisdictionPackCode: string;
    jurisdictionPackVersion: string;
  } | null;
  logo: ExportLogo | null;
  locale: ExportLocale;
}

const DISCLAIMER: Record<ExportLocale, string> = {
  en: 'This tool supports compliance preparation and does not constitute legal advice.',
  ro: 'Acest instrument sprijină pregătirea conformării și nu constituie consultanță juridică.',
};

const LEGAL_REVIEW_NOTICE: Record<ExportLocale, string> = {
  en: 'The Romanian document template is pending qualified legal review. Confirm DNSC registration and reporting requirements before submission.',
  ro: 'Șablonul românesc este în așteptarea revizuirii juridice calificate. Confirmați cerințele de înregistrare și raportare la DNSC înainte de depunere.',
};

const OUTCOME_LABEL: Record<string, Record<ExportLocale, string>> = {
  ESSENTIAL: { en: 'Essential entity', ro: 'Entitate esențială' },
  IMPORTANT: { en: 'Important entity', ro: 'Entitate importantă' },
  LIKELY_IN_SCOPE: { en: 'Likely in scope', ro: 'Probabil în domeniu' },
  OUT_OF_SCOPE: { en: 'Out of scope', ro: 'În afara domeniului' },
};

const STATUS_LABEL: Record<DocumentStatus, Record<ExportLocale, string>> = {
  NOT_STARTED: { en: 'Not started', ro: 'Neînceput' },
  IN_PROGRESS: { en: 'In progress', ro: 'În lucru' },
  COMPLETE: { en: 'Complete', ro: 'Finalizat' },
  NEEDS_REVIEW: { en: 'Needs review', ro: 'Necesită revizuire' },
};

export function buildDocumentExportModel(input: DocumentModelInput): ExportDocumentModel {
  const template = parseTemplate(input.document.template);
  const payload = payloadObject(input.document.payload);
  const progress = calculateDocumentProgress(template, payload);
  const overdue = Boolean(
    input.document.nextReviewDate && input.document.nextReviewDate < new Date(),
  );
  const templateChanged = input.document.templateVersion !== template.version;
  const status = documentStatusFromProgress(progress.percentage, { overdue, templateChanged });
  const version = input.document.currentVersionLabel
    ? input.versions.find((entry) => entry.versionLabel === input.document.currentVersionLabel)
    : undefined;
  const currentVersion = version ?? input.versions.find((entry) => entry.status === 'APPROVED');

  return {
    kind: 'document',
    organizationName: input.organization.name,
    legalName: input.profile?.legalName ?? input.organization.name,
    documentId: input.document.id,
    templateKey: template.key,
    templateVersion: template.version,
    title: local(template.title, input.locale),
    shortDescription: local(template.shortDescription, input.locale),
    legalReference: template.legalReference,
    ownerRole: template.ownerRole,
    classification: input.document.classification,
    status: STATUS_LABEL[status][input.locale],
    progress: progress.percentage,
    currentRevisionNo: input.document.currentRevisionNo,
    versionLabel: input.document.currentVersionLabel ?? '—',
    versionStatus: currentVersion?.status ?? 'NOT_PUBLISHED',
    approvalStatus:
      currentVersion?.status === 'APPROVED'
        ? input.locale === 'ro'
          ? 'Aprobat'
          : 'Approved'
        : currentVersion
          ? input.locale === 'ro'
            ? 'Draft'
            : 'Draft'
          : input.locale === 'ro'
            ? 'Neaprobat'
            : 'Not approved',
    generatedAt: new Date().toISOString(),
    nextReviewDate: input.document.nextReviewDate?.toISOString() ?? null,
    logo: input.logo,
    sections: template.sections.map((section) => ({
      key: section.key,
      title: local(section.title, input.locale),
      fields: section.fields
        .filter((field) => isVisible(field, payload))
        .map((field) => exportField(field, payload[field.key], input.locale)),
    })),
    revisionHistory: input.revisions.map((revision) => ({
      revisionNo: revision.revisionNo,
      date: revision.createdAt.toISOString(),
      author: displayName(revision.createdBy),
      changeNote: revision.changeNote ?? '',
      changedFields: changedFields(revision.changedFields).length.toString(),
    })),
    approvals: (currentVersion?.approvals ?? []).map((approval) => ({
      approver: displayName(approval.approver),
      role: approval.role ?? '',
      date: approval.createdAt.toISOString(),
      comment: approval.comment ?? '',
      signature: signatureName(approval.signature),
    })),
    disclaimer: DISCLAIMER[input.locale],
    legalReviewNotice: LEGAL_REVIEW_NOTICE[input.locale],
  };
}

export function buildComplianceModel(input: ComplianceModelInput): ExportComplianceModel {
  const applicability =
    z.array(documentApplicabilitySchema).safeParse(input.latestRun?.applicability ?? []).data ?? [];
  const applicabilityByKey = new Map(applicability.map((entry) => [entry.templateKey, entry]));
  const documentsByKey = new Map<string, Document & { template: DocumentTemplate }>();
  for (const document of input.documents) {
    if (!documentsByKey.has(document.template.key)) {
      documentsByKey.set(document.template.key, document);
    }
  }

  const rows: ExportComplianceDocumentRow[] = input.templates.map((record) => {
    const template = parseTemplate(record);
    const document = documentsByKey.get(template.key);
    const payload = document ? payloadObject(document.payload) : {};
    const progress = document ? calculateDocumentProgress(template, payload) : null;
    const rule = applicabilityByKey.get(template.key);
    const status = document
      ? documentStatusFromProgress(progress?.percentage ?? 0, {
          overdue: Boolean(document.nextReviewDate && document.nextReviewDate < new Date()),
          templateChanged: document.templateVersion !== template.version,
        })
      : 'NOT_STARTED';
    return {
      key: template.key,
      title: local(template.title, input.locale),
      legalReference: template.legalReference,
      required: rule?.required ?? false,
      status: STATUS_LABEL[status][input.locale],
      progress: progress?.percentage ?? 0,
      version: document?.currentVersionLabel ?? '—',
      outstanding: progress?.requiredRemaining ?? 0,
    };
  });

  const required = rows.filter((row) => row.required);
  const basis = required.length > 0 ? required : rows.filter((row) => row.progress > 0);
  const overallProgress =
    basis.length === 0
      ? 0
      : Math.round(basis.reduce((sum, row) => sum + row.progress, 0) / basis.length);
  const outstandingItems = basis
    .filter((row) => row.progress < 100)
    .map((row) =>
      row.progress === 0
        ? `${row.title}: ${input.locale === 'ro' ? 'neînceput' : 'not started'}`
        : `${row.title}: ${row.outstanding} ${input.locale === 'ro' ? 'câmpuri obligatorii rămase' : 'required fields remaining'}`,
    );

  const classification = classificationSummary(input.latestRun, input.locale);

  return {
    kind: 'compliance',
    organizationName: input.organization.name,
    legalName: input.profile?.legalName ?? input.organization.name,
    generatedAt: new Date().toISOString(),
    logo: input.logo,
    classificationResult: input.latestRun?.result ?? 'NOT_CLASSIFIED',
    classificationLabel:
      OUTCOME_LABEL[input.latestRun?.result ?? '']?.[input.locale] ??
      (input.locale === 'ro' ? 'Neclasificat' : 'Not classified'),
    sector: classification.sector,
    sizeCategory: classification.sizeCategory,
    packCode: input.latestRun?.jurisdictionPackCode ?? input.organization.jurisdictionPackCode,
    packVersion: input.latestRun?.jurisdictionPackVersion ?? '—',
    overallProgress,
    requiredCount: required.length,
    completedCount: required.filter((row) => row.progress >= 100).length,
    documents: rows,
    outstandingItems,
    disclaimer: DISCLAIMER[input.locale],
    legalReviewNotice: LEGAL_REVIEW_NOTICE[input.locale],
  };
}

export function parseTemplate(record: DocumentTemplate): SharedDocumentTemplate {
  return documentTemplateSchema.parse(record.schema);
}

export function payloadObject(value: Prisma.JsonValue): DocumentPayload {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as DocumentPayload;
  }
  return {};
}

function exportField(field: DocumentField, raw: unknown, locale: ExportLocale): ExportField {
  const label = local(field.label, locale);
  const help = field.help ? local(field.help, locale) : undefined;

  if (field.type === 'table') {
    const rows = Array.isArray(raw) ? raw.filter(isRecord) : [];
    const headers = (field.columns ?? []).map((column) => local(column.label, locale));
    return {
      kind: 'table',
      label,
      help,
      headers,
      rows: rows.map((row) => ({
        cells: (field.columns ?? []).map((column) => {
          const value = row[column.key];
          if (column.options) {
            const option = column.options.find((entry) => entry.value === value);
            return option ? local(option.label, locale) : stringValue(value);
          }
          return stringValue(value);
        }),
      })),
    };
  }

  if (field.type === 'checklist') {
    const record = isRecord(raw) ? raw : {};
    return {
      kind: 'checklist',
      label,
      help,
      items: (field.items ?? []).map((item) => ({
        label: local(item.label, locale),
        checked: record[item.key] === true,
      })),
    };
  }

  if (field.type === 'riskMatrix') {
    const record = isRecord(raw) ? raw : {};
    const likelihood = Number(record.likelihood ?? 0);
    const impact = Number(record.impact ?? 0);
    const score = likelihood * impact;
    return {
      kind: 'riskMatrix',
      label,
      help,
      likelihood,
      impact,
      score,
      rating: riskRating(score, locale),
    };
  }

  if (field.type === 'signature') {
    const record = isRecord(raw) ? raw : {};
    return {
      kind: 'signature',
      label,
      help,
      name: stringValue(record.name),
      role: stringValue(record.role),
      date: stringValue(record.date),
    };
  }

  if (field.type === 'attachment') {
    return {
      kind: 'attachment',
      label,
      help,
      value:
        locale === 'ro'
          ? 'Fișierele sunt disponibile în platformă.'
          : 'Files are available in the platform.',
    };
  }

  if (field.type === 'multiSelect') {
    const values = Array.isArray(raw)
      ? raw
          .filter((value): value is string => typeof value === 'string')
          .map((value) => optionLabel(field, value, locale))
      : [];
    return { kind: 'multiSelect', label, help, values };
  }

  if (field.type === 'select') {
    return {
      kind: 'select',
      label,
      help,
      value: raw === undefined || raw === null ? '—' : optionLabel(field, String(raw), locale),
    };
  }

  if (field.type === 'yesNo') {
    return {
      kind: 'yesNo',
      label,
      help,
      value:
        typeof raw === 'boolean'
          ? raw
            ? locale === 'ro'
              ? 'Da'
              : 'Yes'
            : locale === 'ro'
              ? 'Nu'
              : 'No'
          : '—',
    };
  }

  if (field.type === 'richText') {
    return { kind: 'richText', label, help, value: stringValue(raw) };
  }

  if (field.type === 'date' || field.type === 'datetime') {
    return {
      kind: 'text',
      label,
      help,
      value: raw ? formatDate(String(raw), locale) : '—',
    };
  }

  return { kind: 'text', label, help, value: stringValue(raw) };
}

function classificationSummary(
  run: ComplianceModelInput['latestRun'],
  locale: ExportLocale,
): { sector: string; sizeCategory: string } {
  if (!run) {
    return { sector: '—', sizeCategory: '—' };
  }
  const inputs = classificationAnswersSchema.safeParse(run.inputs);
  const pack = getClassificationPack(run.jurisdictionPackCode);
  if (!inputs.success || !pack) {
    return { sector: '—', sizeCategory: '—' };
  }
  try {
    const selection = resolveSelection(pack, inputs.data);
    const size = calculateEnterpriseSize(inputs.data.size, pack.sizeRules);
    const sizeLabels: Record<string, Record<ExportLocale, string>> = {
      micro: { en: 'Micro', ro: 'Micro' },
      small: { en: 'Small', ro: 'Mică' },
      medium: { en: 'Medium', ro: 'Mijlocie' },
      large: { en: 'Large', ro: 'Mare' },
    };
    return {
      sector: local(selection.sectorName, locale),
      sizeCategory: sizeLabels[size.category]?.[locale] ?? size.category,
    };
  } catch {
    return { sector: '—', sizeCategory: '—' };
  }
}

function local(value: LocalizedText, locale: ExportLocale): string {
  return locale === 'ro' ? value.ro : value.en;
}

function optionLabel(field: DocumentField, value: string, locale: ExportLocale): string {
  return field.options?.find((option) => option.value === value)
    ? local(field.options.find((option) => option.value === value)!.label, locale)
    : value;
}

function isVisible(field: DocumentField, payload: DocumentPayload): boolean {
  const condition = field.conditional;
  if (!condition) return true;
  const value = payload[condition.field];
  if (
    condition.equals !== undefined &&
    JSON.stringify(value) !== JSON.stringify(condition.equals)
  ) {
    return false;
  }
  if (
    condition.notEquals !== undefined &&
    JSON.stringify(value) === JSON.stringify(condition.notEquals)
  ) {
    return false;
  }
  return true;
}

function changedFields(value: Prisma.JsonValue | null): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const fields = (value as { fields?: unknown }).fields;
  return Array.isArray(fields)
    ? fields.filter((field): field is string => typeof field === 'string')
    : [];
}

function signatureName(value: Prisma.JsonValue | null): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
}

function displayName(user: Pick<User, 'givenName' | 'familyName' | 'email'>): string {
  const name = `${user.givenName} ${user.familyName}`.trim();
  return name.length > 0 ? name : user.email;
}

function formatDate(value: string, locale: ExportLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function stringValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value.trim().length > 0 ? value : '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '—';
}

function riskRating(score: number, locale: ExportLocale): string {
  if (score >= 15) return locale === 'ro' ? 'Risc ridicat' : 'High risk';
  if (score >= 8) return locale === 'ro' ? 'Risc mediu' : 'Medium risk';
  if (score > 0) return locale === 'ro' ? 'Risc redus' : 'Low risk';
  return locale === 'ro' ? 'Necompletat' : 'Not set';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function exportStatusLabel(status: DocumentStatus, locale: ExportLocale): string {
  return STATUS_LABEL[status][locale];
}
