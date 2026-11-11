import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  classificationAnswersSchema,
  EU_MEMBER_STATES,
  NOT_LISTED_SECTOR_CODE,
  type ClassificationAnswers,
  type ClassificationCatalog,
  type ClassificationRun,
} from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ApiClientError, classificationApi } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/format';

const steps = ['entity', 'size', 'criteria', 'review'] as const;

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const checkboxClass =
  'mt-0.5 h-4 w-4 rounded border-input text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const emptyAnswers: ClassificationAnswers = {
  establishmentCountries: ['RO'],
  sectorCode: '',
  subsectorCode: '',
  entityTypeCode: '',
  size: {
    employees: 0,
    annualTurnoverEur: 0,
    balanceSheetTotalEur: 0,
    consolidation: 'AUTONOMOUS',
    partners: [],
    linkedEnterprises: [],
  },
  sizeIndependent: {
    publicAdministrationLevel: 'NONE',
    qualifiedTrustServiceProvider: false,
    tldRegistry: false,
    dnsServiceProvider: false,
    publicElectronicCommunications: false,
    trustServiceProvider: false,
    domainNameRegistration: false,
    cerCriticalEntity: false,
    soleProvider: false,
    significantSocietalImpact: false,
    crossBorderSystemic: false,
    nationalImportance: false,
    identifiedEssentialByMemberState: false,
  },
};

const roleFlags = [
  ['qualifiedTrustServiceProvider', 'roleQualifiedTrust'],
  ['tldRegistry', 'roleTld'],
  ['dnsServiceProvider', 'roleDns'],
  ['publicElectronicCommunications', 'rolePublicComms'],
  ['trustServiceProvider', 'roleTrust'],
  ['domainNameRegistration', 'roleDomainRegistration'],
  ['cerCriticalEntity', 'roleCer'],
] as const;

const designationFlags = [
  ['identifiedEssentialByMemberState', 'designationIdentifiedEssential'],
  ['soleProvider', 'designationSole'],
  ['significantSocietalImpact', 'designationImpact'],
  ['crossBorderSystemic', 'designationSystemic'],
  ['nationalImportance', 'designationNational'],
] as const;

type UnitKind = 'partners' | 'linkedEnterprises';
type EnterpriseUnit = ClassificationAnswers['size']['partners'][number];

export function ClassificationWizard({
  catalog,
  initial,
  onSubmitted,
  onCancel,
}: {
  catalog: ClassificationCatalog;
  initial?: ClassificationAnswers | null;
  onSubmitted: (run: ClassificationRun) => void;
  onCancel?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [answers, setAnswers] = useState<ClassificationAnswers>(initial ?? emptyAnswers);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locale = i18n.language.startsWith('ro') ? 'ro' : 'en';
  const step = steps[stepIndex] ?? 'entity';
  const regionNames = new Intl.DisplayNames([locale], { type: 'region' });

  const sector = catalog.sectors.find((entry) => entry.code === answers.sectorCode);
  const subsector = sector?.subsectors.find((entry) => entry.code === answers.subsectorCode);
  const isNotListed = answers.sectorCode === NOT_LISTED_SECTOR_CODE;

  const updateSize = (patch: Partial<ClassificationAnswers['size']>) => {
    setAnswers((current) => ({ ...current, size: { ...current.size, ...patch } }));
  };

  const updateCriteria = (patch: Partial<ClassificationAnswers['sizeIndependent']>) => {
    setAnswers((current) => ({
      ...current,
      sizeIndependent: { ...current.sizeIndependent, ...patch },
    }));
  };

  const updateFlag = (
    field: Exclude<keyof ClassificationAnswers['sizeIndependent'], 'publicAdministrationLevel'>,
    value: boolean,
  ) => {
    updateCriteria({ [field]: value } as Partial<ClassificationAnswers['sizeIndependent']>);
  };

  const toggleCountry = (code: (typeof EU_MEMBER_STATES)[number]) => {
    setAnswers((current) => ({
      ...current,
      establishmentCountries: current.establishmentCountries.includes(code)
        ? current.establishmentCountries.filter((entry) => entry !== code)
        : [...current.establishmentCountries, code],
    }));
  };

  const selectSector = (code: string) => {
    if (code === NOT_LISTED_SECTOR_CODE) {
      setAnswers((current) => ({
        ...current,
        sectorCode: NOT_LISTED_SECTOR_CODE,
        subsectorCode: NOT_LISTED_SECTOR_CODE,
        entityTypeCode: NOT_LISTED_SECTOR_CODE,
      }));
      return;
    }
    setAnswers((current) => ({
      ...current,
      sectorCode: code,
      subsectorCode: '',
      entityTypeCode: '',
    }));
  };

  const addUnit = (kind: UnitKind) => {
    const unit: EnterpriseUnit = {
      name: '',
      employees: 0,
      annualTurnoverEur: 0,
      balanceSheetTotalEur: 0,
      ownershipPercent: kind === 'partners' ? 50 : 100,
    };
    updateSize(
      kind === 'partners'
        ? { partners: [...answers.size.partners, unit] }
        : { linkedEnterprises: [...answers.size.linkedEnterprises, unit] },
    );
  };

  const updateUnit = (kind: UnitKind, index: number, patch: Partial<EnterpriseUnit>) => {
    const units = answers.size[kind].map((unit, unitIndex) =>
      unitIndex === index ? { ...unit, ...patch } : unit,
    );
    updateSize(kind === 'partners' ? { partners: units } : { linkedEnterprises: units });
  };

  const removeUnit = (kind: UnitKind, index: number) => {
    const units = answers.size[kind].filter((_unit, unitIndex) => unitIndex !== index);
    updateSize(kind === 'partners' ? { partners: units } : { linkedEnterprises: units });
  };

  const stepValid = (): boolean => {
    if (step === 'entity') {
      return (
        answers.establishmentCountries.length > 0 &&
        answers.sectorCode.length > 0 &&
        (isNotListed || (answers.subsectorCode.length > 0 && answers.entityTypeCode.length > 0))
      );
    }
    if (step === 'size') {
      return (
        answers.size.employees >= 0 &&
        answers.size.annualTurnoverEur >= 0 &&
        answers.size.balanceSheetTotalEur >= 0 &&
        (answers.size.consolidation === 'AUTONOMOUS' ||
          answers.size.partners.length + answers.size.linkedEnterprises.length > 0)
      );
    }
    return true;
  };

  const next = () => {
    if (!stepValid()) {
      setError(t('classification.wizard.validation'));
      return;
    }
    setError(null);
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  };

  const back = () => {
    setError(null);
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const submit = async () => {
    const parsed = classificationAnswersSchema.safeParse(answers);
    if (!parsed.success) {
      setError(t('classification.wizard.validation'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const run = await classificationApi.create(parsed.data);
      onSubmitted(run);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : t('classification.wizard.submitError'),
      );
    } finally {
      setPending(false);
    }
  };

  const numberValue = (value: string): number => (value === '' ? 0 : Number(value));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('classification.wizard.title')}</CardTitle>
        <CardDescription>{t('classification.wizard.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ol
          className="grid gap-2 sm:grid-cols-4"
          aria-label={t('classification.wizard.stepsLabel')}
        >
          {steps.map((entry, index) => (
            <li
              key={entry}
              aria-current={index === stepIndex ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                index === stepIndex
                  ? 'border-primary-500 bg-primary-50 text-primary-800 dark:bg-primary-500/10 dark:text-primary-100'
                  : 'border-border text-muted-foreground'
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-xs font-semibold">
                {index < stepIndex ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              {t(`classification.wizard.steps.${entry}`)}
            </li>
          ))}
        </ol>

        {error ? (
          <Alert variant="danger" role="alert">
            {error}
          </Alert>
        ) : null}

        {step === 'entity' ? (
          <div className="space-y-6">
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">
                {t('classification.wizard.countryTitle')}
              </legend>
              <p className="text-sm text-muted-foreground">
                {t('classification.wizard.countryHelp')}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {EU_MEMBER_STATES.map((code) => (
                  <label
                    key={code}
                    className="flex items-start gap-2 rounded-md border border-border p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={answers.establishmentCountries.includes(code)}
                      onChange={() => toggleCountry(code)}
                    />
                    <span>
                      {regionNames.of(code) ?? code}{' '}
                      <span className="text-muted-foreground">({code})</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                id="classification-sector"
                label={t('classification.wizard.sector')}
                hint={t('classification.wizard.sectorHelp')}
              >
                <select
                  id="classification-sector"
                  className={selectClass}
                  value={answers.sectorCode}
                  onChange={(event) => selectSector(event.target.value)}
                >
                  <option value="">{t('classification.wizard.choose')}</option>
                  {catalog.sectors.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.annex}. {entry.name[locale]}
                    </option>
                  ))}
                  <option value={NOT_LISTED_SECTOR_CODE}>
                    {t('classification.wizard.notListed')}
                  </option>
                </select>
              </Field>

              {isNotListed ? (
                <Alert variant="info">{t('classification.wizard.notListedHelp')}</Alert>
              ) : (
                <>
                  <Field id="classification-subsector" label={t('classification.wizard.subsector')}>
                    <select
                      id="classification-subsector"
                      className={selectClass}
                      value={answers.subsectorCode}
                      disabled={!sector}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          subsectorCode: event.target.value,
                          entityTypeCode: '',
                        }))
                      }
                    >
                      <option value="">{t('classification.wizard.choose')}</option>
                      {sector?.subsectors.map((entry) => (
                        <option key={entry.code} value={entry.code}>
                          {entry.name[locale]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    id="classification-entity-type"
                    label={t('classification.wizard.entityType')}
                  >
                    <select
                      id="classification-entity-type"
                      className={selectClass}
                      value={answers.entityTypeCode}
                      disabled={!subsector}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          entityTypeCode: event.target.value,
                        }))
                      }
                    >
                      <option value="">{t('classification.wizard.choose')}</option>
                      {subsector?.entityTypes.map((entry) => (
                        <option key={entry.code} value={entry.code}>
                          {entry.name[locale]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
            </div>
          </div>
        ) : null}

        {step === 'size' ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold">{t('classification.wizard.sizeTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('classification.wizard.sizeHelp')}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field id="classification-employees" label={t('classification.wizard.employees')}>
                <Input
                  id="classification-employees"
                  type="number"
                  min={0}
                  value={answers.size.employees}
                  onChange={(event) => updateSize({ employees: numberValue(event.target.value) })}
                />
              </Field>
              <Field id="classification-turnover" label={t('classification.wizard.turnover')}>
                <Input
                  id="classification-turnover"
                  type="number"
                  min={0}
                  step={1000}
                  value={answers.size.annualTurnoverEur}
                  onChange={(event) =>
                    updateSize({ annualTurnoverEur: numberValue(event.target.value) })
                  }
                />
              </Field>
              <Field id="classification-balance" label={t('classification.wizard.balanceSheet')}>
                <Input
                  id="classification-balance"
                  type="number"
                  min={0}
                  step={1000}
                  value={answers.size.balanceSheetTotalEur}
                  onChange={(event) =>
                    updateSize({ balanceSheetTotalEur: numberValue(event.target.value) })
                  }
                />
              </Field>
            </div>

            <Field
              id="classification-consolidation"
              label={t('classification.wizard.consolidation')}
              hint={t('classification.wizard.consolidationHelp')}
            >
              <select
                id="classification-consolidation"
                className={selectClass}
                value={answers.size.consolidation}
                onChange={(event) =>
                  updateSize({
                    consolidation: event.target
                      .value as ClassificationAnswers['size']['consolidation'],
                  })
                }
              >
                <option value="AUTONOMOUS">
                  {t('classification.wizard.consolidationOptions.AUTONOMOUS')}
                </option>
                <option value="PARTNER_LINKED">
                  {t('classification.wizard.consolidationOptions.PARTNER_LINKED')}
                </option>
              </select>
            </Field>

            {answers.size.consolidation === 'PARTNER_LINKED' ? (
              <div className="space-y-6">
                <UnitGroup
                  kind="partners"
                  title={t('classification.wizard.partnersTitle')}
                  help={t('classification.wizard.partnersHelp')}
                  units={answers.size.partners}
                  locale={locale}
                  onAdd={() => addUnit('partners')}
                  onRemove={(index) => removeUnit('partners', index)}
                  onChange={(index, patch) => updateUnit('partners', index, patch)}
                />
                <UnitGroup
                  kind="linkedEnterprises"
                  title={t('classification.wizard.linkedTitle')}
                  help={t('classification.wizard.linkedHelp')}
                  units={answers.size.linkedEnterprises}
                  locale={locale}
                  onAdd={() => addUnit('linkedEnterprises')}
                  onRemove={(index) => removeUnit('linkedEnterprises', index)}
                  onChange={(index, patch) => updateUnit('linkedEnterprises', index, patch)}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 'criteria' ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold">{t('classification.wizard.criteriaTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('classification.wizard.criteriaHelp')}
              </p>
            </div>

            <Field
              id="classification-public-admin"
              label={t('classification.wizard.publicAdministration')}
            >
              <select
                id="classification-public-admin"
                className={selectClass}
                value={answers.sizeIndependent.publicAdministrationLevel}
                onChange={(event) =>
                  updateCriteria({
                    publicAdministrationLevel: event.target
                      .value as ClassificationAnswers['sizeIndependent']['publicAdministrationLevel'],
                  })
                }
              >
                <option value="NONE">
                  {t('classification.wizard.publicAdministrationOptions.NONE')}
                </option>
                <option value="CENTRAL">
                  {t('classification.wizard.publicAdministrationOptions.CENTRAL')}
                </option>
                <option value="REGIONAL">
                  {t('classification.wizard.publicAdministrationOptions.REGIONAL')}
                </option>
                <option value="LOCAL">
                  {t('classification.wizard.publicAdministrationOptions.LOCAL')}
                </option>
              </select>
            </Field>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">
                {t('classification.wizard.specificRoles')}
              </legend>
              <div className="grid gap-2 md:grid-cols-2">
                {roleFlags.map(([field, label]) => (
                  <label
                    key={field}
                    className="flex items-start gap-2 rounded-md border border-border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={answers.sizeIndependent[field]}
                      onChange={(event) => updateFlag(field, event.target.checked)}
                    />
                    <span>{t(`classification.wizard.${label}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">
                {t('classification.wizard.designation')}
              </legend>
              <p className="text-sm text-muted-foreground">
                {t('classification.wizard.designationHelp')}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {designationFlags.map(([field, label]) => (
                  <label
                    key={field}
                    className="flex items-start gap-2 rounded-md border border-border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={answers.sizeIndependent[field]}
                      onChange={(event) => updateFlag(field, event.target.checked)}
                    />
                    <span>{t(`classification.wizard.${label}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold">{t('classification.wizard.reviewTitle')}</h2>
            <dl className="space-y-2 text-sm">
              <Review label={t('classification.wizard.reviewEntity')}>
                {isNotListed
                  ? t('classification.wizard.notListed')
                  : `${sector?.name[locale] ?? ''} · ${subsector?.name[locale] ?? ''} · ${
                      subsector?.entityTypes.find((entry) => entry.code === answers.entityTypeCode)
                        ?.name[locale] ?? ''
                    }`}
              </Review>
              <Review label={t('classification.establishment')}>
                {answers.establishmentCountries.join(', ')}
              </Review>
              <Review label={t('classification.wizard.reviewSize')}>
                {t('classification.wizard.reviewSizeValue', {
                  employees: formatNumber(answers.size.employees, locale),
                  turnover: formatCurrency(answers.size.annualTurnoverEur, locale),
                  balance: formatCurrency(answers.size.balanceSheetTotalEur, locale),
                })}
              </Review>
              <Review label={t('classification.wizard.reviewCriteria')}>
                {answers.sizeIndependent.publicAdministrationLevel !== 'NONE'
                  ? t(
                      `classification.wizard.publicAdministrationOptions.${answers.sizeIndependent.publicAdministrationLevel}`,
                    )
                  : t('classification.wizard.reviewNoCriteria')}
              </Review>
            </dl>
            <Alert variant="info">{t('classification.wizard.reviewHelp')}</Alert>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex gap-2">
            {stepIndex > 0 ? (
              <Button type="button" variant="outline" onClick={back} disabled={pending}>
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('classification.wizard.back')}
              </Button>
            ) : null}
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                {t('classification.wizard.cancel')}
              </Button>
            ) : null}
          </div>
          {step === 'review' ? (
            <Button type="button" onClick={() => void submit()} disabled={pending}>
              {pending ? t('classification.wizard.submitting') : t('classification.wizard.submit')}
            </Button>
          ) : (
            <Button type="button" onClick={next}>
              {t('classification.wizard.next')}
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function UnitGroup({
  kind,
  title,
  help,
  units,
  locale,
  onAdd,
  onRemove,
  onChange,
}: {
  kind: UnitKind;
  title: string;
  help: string;
  units: EnterpriseUnit[];
  locale: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, patch: Partial<EnterpriseUnit>) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <p className="text-sm text-muted-foreground">{help}</p>
      {units.length === 0 ? (
        <Alert variant="info">{t('classification.wizard.noUnits')}</Alert>
      ) : (
        <ul className="space-y-3">
          {units.map((unit, index) => (
            <li
              key={`${kind}-${index}`}
              className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-5"
            >
              <Field id={`${kind}-${index}-name`} label={t('classification.wizard.name')}>
                <Input
                  id={`${kind}-${index}-name`}
                  value={unit.name ?? ''}
                  onChange={(event) => onChange(index, { name: event.target.value })}
                />
              </Field>
              <Field
                id={`${kind}-${index}-employees`}
                label={t('classification.wizard.employeesShort')}
              >
                <Input
                  id={`${kind}-${index}-employees`}
                  type="number"
                  min={0}
                  value={unit.employees}
                  onChange={(event) =>
                    onChange(index, {
                      employees: event.target.value === '' ? 0 : Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field
                id={`${kind}-${index}-turnover`}
                label={t('classification.wizard.turnoverShort')}
              >
                <Input
                  id={`${kind}-${index}-turnover`}
                  type="number"
                  min={0}
                  value={unit.annualTurnoverEur}
                  onChange={(event) =>
                    onChange(index, {
                      annualTurnoverEur: event.target.value === '' ? 0 : Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field
                id={`${kind}-${index}-balance`}
                label={t('classification.wizard.balanceShort')}
              >
                <Input
                  id={`${kind}-${index}-balance`}
                  type="number"
                  min={0}
                  value={unit.balanceSheetTotalEur}
                  onChange={(event) =>
                    onChange(index, {
                      balanceSheetTotalEur:
                        event.target.value === '' ? 0 : Number(event.target.value),
                    })
                  }
                />
              </Field>
              <div className="flex items-end gap-2">
                {kind === 'partners' ? (
                  <Field
                    id={`${kind}-${index}-ownership`}
                    label={t('classification.wizard.ownership')}
                  >
                    <Input
                      id={`${kind}-${index}-ownership`}
                      type="number"
                      min={25}
                      max={100}
                      value={unit.ownershipPercent}
                      onChange={(event) =>
                        onChange(index, {
                          ownershipPercent:
                            event.target.value === '' ? 0 : Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(index)}
                  aria-label={t('classification.wizard.remove')}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t(
          kind === 'partners'
            ? 'classification.wizard.addPartner'
            : 'classification.wizard.addLinked',
        )}
      </Button>
      <p className="text-xs text-muted-foreground">
        {t('classification.wizard.unitsSummary', {
          employees: formatNumber(
            units.reduce((sum, unit) => sum + unit.employees, 0),
            locale,
          ),
        })}
      </p>
    </fieldset>
  );
}

function Review({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-1 border-b border-border/60 pb-2 last:border-0 sm:flex-row sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
