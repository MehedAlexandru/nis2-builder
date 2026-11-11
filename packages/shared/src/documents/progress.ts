import type {
  DocumentField,
  DocumentPayload,
  DocumentProgress,
  DocumentSectionProgress,
  DocumentTemplate,
  DocumentValidationIssue,
} from '../schemas/documents';

type JsonRecord = Record<string, unknown>;

export const EMPTY_DOCUMENT_PAYLOAD: DocumentPayload = {};

export function visibleTemplateFields(
  template: DocumentTemplate,
  payload: DocumentPayload,
): DocumentField[] {
  return template.sections.flatMap((section) =>
    section.fields.filter((field) => isFieldVisible(field, payload)),
  );
}

export function isFieldVisible(field: DocumentField, payload: DocumentPayload): boolean {
  const condition = field.conditional;
  if (!condition) return true;
  const value = payload[condition.field];
  if (condition.equals !== undefined && !sameValue(value, condition.equals)) return false;
  if (condition.notEquals !== undefined && sameValue(value, condition.notEquals)) return false;
  if (condition.in && !condition.in.some((candidate) => sameValue(value, candidate))) return false;
  return true;
}

export function isFieldComplete(field: DocumentField, value: unknown): boolean {
  switch (field.type) {
    case 'text':
    case 'richText':
    case 'select':
    case 'date':
    case 'datetime':
    case 'peoplePicker':
      return typeof value === 'string' ? value.trim().length > 0 : false;
    case 'multiSelect':
      if (!Array.isArray(value)) return false;
      return value.length >= (field.validation?.minSelections ?? 1);
    case 'table': {
      if (!Array.isArray(value)) return false;
      const rows = value.filter(isRecord);
      if (rows.length < (field.validation?.minRows ?? 1)) return false;
      const requiredColumns = (field.columns ?? []).filter((column) => column.required);
      return rows.every((row) =>
        requiredColumns.every((column) => {
          const cell = row[column.key];
          return cell !== null && cell !== undefined && String(cell).trim().length > 0;
        }),
      );
    }
    case 'checklist': {
      if (!isRecord(value)) return false;
      const requiredItems = (field.items ?? []).filter((item) => item.required);
      return requiredItems.every((item) => value[item.key] === true);
    }
    case 'attachment':
      return Array.isArray(value) && value.length > 0;
    case 'yesNo':
      return typeof value === 'boolean';
    case 'riskMatrix': {
      if (!isRecord(value)) return false;
      return isScore(value.likelihood) && isScore(value.impact);
    }
    case 'signature': {
      if (!isRecord(value)) return false;
      return (
        typeof value.name === 'string' &&
        value.name.trim().length > 0 &&
        typeof value.date === 'string' &&
        value.date.trim().length > 0
      );
    }
    default:
      return false;
  }
}

export function validateDocumentPayload(
  template: DocumentTemplate,
  payload: DocumentPayload,
): DocumentValidationIssue[] {
  const issues: DocumentValidationIssue[] = [];

  for (const field of visibleTemplateFields(template, payload)) {
    const value = payload[field.key];
    const complete = isFieldComplete(field, value);

    if (field.required && !complete) {
      issues.push({
        fieldKey: field.key,
        message: 'This field is required for a complete document.',
        severity: 'error',
      });
      continue;
    }
    if (!complete) continue;

    if (typeof value === 'string') {
      if (field.validation?.minLength && value.trim().length < field.validation.minLength) {
        issues.push({
          fieldKey: field.key,
          message: `Use at least ${field.validation.minLength} characters.`,
          severity: 'error',
        });
      }
      if (field.validation?.maxLength && value.length > field.validation.maxLength) {
        issues.push({
          fieldKey: field.key,
          message: `Use at most ${field.validation.maxLength} characters.`,
          severity: 'error',
        });
      }
      if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) {
        issues.push({
          fieldKey: field.key,
          message: 'The value has an unexpected format.',
          severity: 'error',
        });
      }
      if (
        field.options &&
        field.options.length > 0 &&
        !field.options.some((option) => option.value === value)
      ) {
        issues.push({
          fieldKey: field.key,
          message: 'Choose one of the available options.',
          severity: 'error',
        });
      }
    }

    if (Array.isArray(value)) {
      if (field.validation?.maxSelections && value.length > field.validation.maxSelections) {
        issues.push({
          fieldKey: field.key,
          message: `Select at most ${field.validation.maxSelections} options.`,
          severity: 'error',
        });
      }
      if (field.type === 'table') {
        if (field.validation?.maxRows && value.length > field.validation.maxRows) {
          issues.push({
            fieldKey: field.key,
            message: `Use at most ${field.validation.maxRows} rows.`,
            severity: 'error',
          });
        }
      }
    }

    if (field.type === 'riskMatrix' && isRecord(value)) {
      if (!isScore(value.likelihood) || !isScore(value.impact)) {
        issues.push({
          fieldKey: field.key,
          message: 'Choose a likelihood and impact from 1 to 5.',
          severity: 'error',
        });
      }
    }
  }

  return issues;
}

export function calculateDocumentProgress(
  template: DocumentTemplate,
  payload: DocumentPayload,
): DocumentProgress {
  const issues = validateDocumentPayload(template, payload);
  const issuesByField = new Map<string, DocumentValidationIssue>();
  for (const issue of issues) {
    if (!issuesByField.has(issue.fieldKey)) issuesByField.set(issue.fieldKey, issue);
  }

  let completedWeight = 0;
  let totalWeight = 0;
  let requiredRemaining = 0;
  const sections: DocumentSectionProgress[] = template.sections.map((section) => {
    let sectionCompleted = 0;
    let sectionTotal = 0;

    for (const field of section.fields) {
      if (!isFieldVisible(field, payload)) continue;
      const weight = field.weight ?? 2;
      const complete = isFieldComplete(field, payload[field.key]);
      sectionTotal += weight;
      if (complete) sectionCompleted += weight;
      if (field.required && !complete) requiredRemaining += 1;
    }

    completedWeight += sectionCompleted;
    totalWeight += sectionTotal;
    return {
      key: section.key,
      title: section.title,
      completedWeight: sectionCompleted,
      totalWeight: sectionTotal,
      percentage: sectionTotal === 0 ? 100 : Math.round((sectionCompleted / sectionTotal) * 100),
    };
  });

  return {
    percentage: totalWeight === 0 ? 100 : Math.round((completedWeight / totalWeight) * 100),
    completedWeight,
    totalWeight,
    requiredRemaining,
    sections,
    issues: issues.map((issue) => ({
      ...issue,
      message: issuesByField.get(issue.fieldKey)?.message ?? issue.message,
    })),
  };
}

export function diffDocumentPayloads(
  template: DocumentTemplate,
  previous: DocumentPayload,
  next: DocumentPayload,
): string[] {
  return visibleTemplateFields(template, { ...previous, ...next })
    .filter((field) => !sameValue(previous[field.key], next[field.key]))
    .map((field) => field.key)
    .sort();
}

export function applyDocumentPrefill(
  template: DocumentTemplate,
  payload: DocumentPayload,
  profile: JsonRecord,
): DocumentPayload {
  const next: DocumentPayload = { ...payload };
  for (const field of template.sections.flatMap((section) => section.fields)) {
    if (!field.prefillKey || isFieldComplete(field, next[field.key])) continue;
    const value = getByPath(profile, field.prefillKey);
    if (value !== undefined && value !== null && value !== '') {
      next[field.key] = value;
    }
  }
  return next;
}

export function documentStatusFromProgress(
  percentage: number,
  options: { overdue?: boolean; templateChanged?: boolean } = {},
): 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'NEEDS_REVIEW' {
  if (options.overdue || options.templateChanged) return 'NEEDS_REVIEW';
  if (percentage >= 100) return 'COMPLETE';
  if (percentage > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

export function flattenDocumentValues(
  template: DocumentTemplate,
  payload: DocumentPayload,
): Array<{ key: string; label: string; value: unknown }> {
  return template.sections.flatMap((section) =>
    section.fields.map((field) => ({
      key: field.key,
      label: field.label.en,
      value: payload[field.key],
    })),
  );
}

function getByPath(source: JsonRecord, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (Array.isArray(current)) {
      const index = Number(key);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (isRecord(current)) return current[key];
    return undefined;
  }, source);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}
