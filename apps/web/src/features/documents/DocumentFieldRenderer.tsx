import { Plus, Trash2 } from 'lucide-react';
import type { DocumentField, LocalizedText } from '@nis2/shared';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

type FieldValue = unknown;

export function DocumentFieldRenderer({
  field,
  value,
  error,
  locale,
  onChange,
}: {
  field: DocumentField;
  value: FieldValue;
  error?: string;
  locale: 'en' | 'ro';
  onChange: (value: FieldValue) => void;
}) {
  const label = local(field.label, locale);
  const hint = field.help ? local(field.help, locale) : undefined;
  const example = field.example ? local(field.example, locale) : undefined;
  const id = `field-${field.key}`;

  if (field.type === 'attachment') {
    return (
      <div className="rounded-lg border border-dashed border-border p-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hint ?? 'Attachments and malware scanning arrive with the Phase 4 export pipeline.'}
        </p>
      </div>
    );
  }

  if (field.type === 'table') {
    return (
      <TableField field={field} value={value} error={error} locale={locale} onChange={onChange} />
    );
  }

  if (field.type === 'checklist') {
    const record = isRecord(value) ? value : {};
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{label}</legend>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        <div className="space-y-2">
          {(field.items ?? []).map((item) => (
            <label key={item.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-input"
                checked={record[item.key] === true}
                onChange={(event) => onChange({ ...record, [item.key]: event.target.checked })}
                aria-invalid={Boolean(error)}
              />
              <span>{local(item.label, locale)}</span>
            </label>
          ))}
        </div>
        {error ? (
          <p role="alert" className="text-xs font-medium text-danger-600">
            {error}
          </p>
        ) : null}
      </fieldset>
    );
  }

  if (field.type === 'riskMatrix') {
    const record = isRecord(value) ? value : {};
    const likelihood = Number(record.likelihood ?? 0);
    const impact = Number(record.impact ?? 0);
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{label}</legend>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <ScoreSelect
            id={`${id}-likelihood`}
            label={locale === 'ro' ? 'Probabilitate' : 'Likelihood'}
            value={likelihood}
            onChange={(next) => onChange({ ...record, likelihood: next })}
          />
          <ScoreSelect
            id={`${id}-impact`}
            label={locale === 'ro' ? 'Impact' : 'Impact'}
            value={impact}
            onChange={(next) => onChange({ ...record, impact: next })}
          />
          <div>
            <p className="text-xs text-muted-foreground">{locale === 'ro' ? 'Scor' : 'Score'}</p>
            <p className="mt-2 text-lg font-bold tabular-nums">
              {likelihood && impact ? likelihood * impact : '—'}
            </p>
          </div>
        </div>
        {likelihood && impact ? (
          <p
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${riskClass(
              likelihood * impact,
            )}`}
          >
            {riskLabel(likelihood * impact, locale)}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs font-medium text-danger-600">
            {error}
          </p>
        ) : null}
      </fieldset>
    );
  }

  if (field.type === 'signature') {
    const record = isRecord(value) ? value : {};
    return (
      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">{label}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id={`${id}-name`} label={locale === 'ro' ? 'Nume' : 'Name'}>
            <Input
              id={`${id}-name`}
              value={stringValue(record.name)}
              onChange={(event) => onChange({ ...record, name: event.target.value })}
              aria-invalid={Boolean(error)}
            />
          </Field>
          <Field id={`${id}-role`} label={locale === 'ro' ? 'Functie' : 'Role'}>
            <Input
              id={`${id}-role`}
              value={stringValue(record.role)}
              onChange={(event) => onChange({ ...record, role: event.target.value })}
            />
          </Field>
          <Field id={`${id}-date`} label={locale === 'ro' ? 'Data' : 'Date'}>
            <Input
              id={`${id}-date`}
              type="date"
              value={stringValue(record.date)}
              onChange={(event) => onChange({ ...record, date: event.target.value })}
            />
          </Field>
        </div>
        {error ? (
          <p role="alert" className="text-xs font-medium text-danger-600">
            {error}
          </p>
        ) : null}
      </fieldset>
    );
  }

  if (field.type === 'yesNo') {
    return (
      <Field id={id} label={label} hint={hint} error={error}>
        <select
          id={id}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={typeof value === 'boolean' ? String(value) : ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : event.target.value === 'true')
          }
          aria-invalid={Boolean(error)}
        >
          <option value="">—</option>
          <option value="true">{locale === 'ro' ? 'Da' : 'Yes'}</option>
          <option value="false">{locale === 'ro' ? 'Nu' : 'No'}</option>
        </select>
      </Field>
    );
  }

  if (field.type === 'select') {
    return (
      <Field id={id} label={label} hint={hint} error={error}>
        <select
          id={id}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={stringValue(value)}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
        >
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {local(option.label, locale)}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  if (field.type === 'multiSelect') {
    const selected = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{label}</legend>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {(field.options ?? []).map((option) => (
            <label key={option.value} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-input"
                checked={selected.includes(option.value)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((item) => item !== option.value),
                  )
                }
              />
              <span>{local(option.label, locale)}</span>
            </label>
          ))}
        </div>
        {error ? (
          <p role="alert" className="text-xs font-medium text-danger-600">
            {error}
          </p>
        ) : null}
      </fieldset>
    );
  }

  if (field.type === 'richText') {
    return (
      <Field id={id} label={label} hint={hint} error={error}>
        <textarea
          id={id}
          rows={5}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={stringValue(value)}
          onChange={(event) => onChange(event.target.value)}
          placeholder={example}
          aria-invalid={Boolean(error)}
        />
      </Field>
    );
  }

  const inputType =
    field.type === 'date'
      ? 'date'
      : field.type === 'datetime'
        ? 'datetime-local'
        : field.type === 'peoplePicker'
          ? 'text'
          : 'text';

  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <Input
        id={id}
        type={inputType}
        value={stringValue(value)}
        onChange={(event) => onChange(event.target.value)}
        placeholder={example ?? (field.type === 'peoplePicker' ? 'Name or email' : undefined)}
        aria-invalid={Boolean(error)}
      />
    </Field>
  );
}

function TableField({
  field,
  value,
  error,
  locale,
  onChange,
}: {
  field: DocumentField;
  value: unknown;
  error?: string;
  locale: 'en' | 'ro';
  onChange: (value: unknown) => void;
}) {
  const rows = Array.isArray(value) ? value.filter(isRecord) : [];
  const columns = field.columns ?? [];
  const emptyRow = Object.fromEntries(columns.map((column) => [column.key, '']));
  const updateRow = (index: number, key: string, cell: unknown) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: cell } : row)));
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{local(field.label, locale)}</legend>
      {field.help ? (
        <p className="text-xs text-muted-foreground">{local(field.help, locale)}</p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-primary-600 text-white">
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className="px-3 py-2 text-left font-semibold">
                  {local(column.label, locale)}
                  {column.required ? <span aria-hidden="true"> *</span> : null}
                </th>
              ))}
              <th scope="col" className="w-12 px-2 py-2">
                <span className="sr-only">{locale === 'ro' ? 'Actiuni' : 'Actions'}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
                  {locale === 'ro' ? 'Nicio inregistrare inca.' : 'No rows yet.'}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="odd:bg-primary-50/40 dark:odd:bg-primary-500/5">
                  {columns.map((column) => (
                    <td key={column.key} className="px-2 py-1.5 align-top">
                      {column.type === 'select' && column.options ? (
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={stringValue(row[column.key])}
                          onChange={(event) => updateRow(index, column.key, event.target.value)}
                          aria-label={local(column.label, locale)}
                        >
                          <option value="">—</option>
                          {column.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {local(option.label, locale)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          className="h-9"
                          type={column.type === 'number' ? 'number' : 'text'}
                          value={stringValue(row[column.key])}
                          onChange={(event) => updateRow(index, column.key, event.target.value)}
                          aria-label={local(column.label, locale)}
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={locale === 'ro' ? 'Sterge randul' : 'Remove row'}
                      onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, emptyRow])}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {locale === 'ro' ? 'Adauga rand' : 'Add row'}
        </Button>
        {field.validation?.minRows ? (
          <p className="text-xs text-muted-foreground">
            {locale === 'ro'
              ? `Minim ${field.validation.minRows} randuri`
              : `At least ${field.validation.minRows} rows`}
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function ScoreSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        value={value || ''}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        <option value="">—</option>
        {[1, 2, 3, 4, 5].map((score) => (
          <option key={score} value={score}>
            {score}
          </option>
        ))}
      </select>
    </div>
  );
}

function local(value: LocalizedText, locale: 'en' | 'ro'): string {
  return locale === 'ro' ? value.ro : value.en;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function riskClass(score: number): string {
  if (score >= 15)
    return 'bg-danger-100 text-danger-700 dark:bg-danger-700/30 dark:text-danger-100';
  if (score >= 8)
    return 'bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100';
  return 'bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-100';
}

function riskLabel(score: number, locale: 'en' | 'ro'): string {
  if (score >= 15) return locale === 'ro' ? 'Risc ridicat' : 'High risk';
  if (score >= 8) return locale === 'ro' ? 'Risc mediu' : 'Medium risk';
  return locale === 'ro' ? 'Risc redus' : 'Low risk';
}
