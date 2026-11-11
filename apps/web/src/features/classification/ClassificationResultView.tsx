import { Download, History, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ClassificationRun } from '@nis2/shared';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ApiClientError, classificationApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const outcomeVariant: Record<
  ClassificationRun['result'],
  'danger' | 'warning' | 'success' | 'primary'
> = {
  ESSENTIAL: 'danger',
  IMPORTANT: 'warning',
  LIKELY_IN_SCOPE: 'warning',
  OUT_OF_SCOPE: 'success',
};

export function ClassificationResultView({
  run,
  onRerun,
}: {
  run: ClassificationRun;
  onRerun?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const locale = i18n.language.startsWith('ro') ? 'ro' : 'en';
  const reason = String(t(run.reasonKey as 'classification.reasons.stored'));

  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value);

  const download = async () => {
    setDownloading(true);
    setPdfError(null);
    try {
      const blob = await classificationApi.downloadPdf(run.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `nis2-classification-v${run.version}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setPdfError(caught instanceof ApiClientError ? caught.message : t('classification.pdfError'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={outcomeVariant[run.result]}>{run.consequences.heading[locale]}</Badge>
              <Badge variant="neutral">
                {t('classification.version', { version: run.version })}
              </Badge>
              <Badge variant="neutral">{t(`classification.confidence.${run.confidence}`)}</Badge>
            </div>
            <CardTitle>{t('classification.resultTitle')}</CardTitle>
            <CardDescription className="max-w-3xl leading-relaxed">{reason}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void download()}
              disabled={downloading}
            >
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {downloading ? t('classification.downloadingPdf') : t('classification.downloadPdf')}
            </Button>
            {onRerun ? (
              <Button variant="outline" size="sm" onClick={onRerun}>
                <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('classification.rerun')}
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm">
              <Link to="/classification">
                <History className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('classification.backToOverview')}
              </Link>
            </Button>
          </div>
        </CardHeader>
        {pdfError ? (
          <CardContent>
            <Alert variant="danger" role="alert">
              {pdfError}
            </Alert>
          </CardContent>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('classification.summaryTitle')}</CardTitle>
            <CardDescription>{t('classification.summarySubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Detail label={t('classification.sector')}>{run.selection.sectorName[locale]}</Detail>
              <Detail label={t('classification.subsector')}>
                {run.selection.subsectorName[locale]}
              </Detail>
              <Detail label={t('classification.entityType')}>
                {run.selection.entityTypeName[locale]}
              </Detail>
              <Detail label={t('classification.establishment')}>
                {run.summary.establishmentCountries.join(', ')}
              </Detail>
              <Detail label={t('classification.sizeCategory')}>
                {t(`classification.sizeCategories.${run.size.category}`)}
              </Detail>
              <Detail label={t('classification.employees')}>
                {new Intl.NumberFormat(locale).format(run.size.total.employees)}
              </Detail>
              <Detail label={t('classification.turnover')}>
                {money(run.size.total.annualTurnoverEur)}
              </Detail>
              <Detail label={t('classification.balanceSheet')}>
                {money(run.size.total.balanceSheetTotalEur)}
              </Detail>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('classification.legalBasisTitle')}</CardTitle>
            <CardDescription>
              {run.jurisdictionPackCode} {run.jurisdictionPackVersion}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {run.legalBasis.map((entry) => (
                <li
                  key={`${entry.citation}-${entry.note ?? ''}`}
                  className="rounded-md border border-border p-3"
                >
                  <p className="font-semibold">{entry.citation}</p>
                  {entry.note ? <p className="mt-1 text-muted-foreground">{entry.note}</p> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('classification.sizeBreakdownTitle')}</CardTitle>
          <CardDescription>{t('classification.sizeBreakdownSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">{t('classification.sizeRows.source')}</th>
                <th className="py-2 pr-4 font-semibold">{t('classification.employees')}</th>
                <th className="py-2 pr-4 font-semibold">{t('classification.turnover')}</th>
                <th className="py-2 font-semibold">{t('classification.balanceSheet')}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['own', run.size.own],
                  ['linked', run.size.linked],
                  ['partners', run.size.partners],
                  ['total', run.size.total],
                ] as const
              ).map(([key, row]) => (
                <tr key={key} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-2 pr-4 text-left font-medium">
                    {t(`classification.sizeRows.${key}`)}
                  </th>
                  <td className="py-2 pr-4 tabular-nums">
                    {new Intl.NumberFormat(locale).format(row.employees)}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{money(row.annualTurnoverEur)}</td>
                  <td className="py-2 tabular-nums">{money(row.balanceSheetTotalEur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('classification.consequencesTitle')}</CardTitle>
          <CardDescription>{t('classification.consequencesSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Consequence label={t('classification.supervision')}>
            {run.consequences.supervision[locale]}
            <Citation>{run.consequences.supervisionCitation}</Citation>
          </Consequence>
          <Consequence label={t('classification.fines')}>
            {run.consequences.fines.description[locale]}
            <Citation>{run.consequences.fines.citation}</Citation>
          </Consequence>
          <Consequence label={t('classification.managementLiability')}>
            {run.consequences.managementLiability[locale]}
          </Consequence>
          <Consequence label={t('classification.registration')}>
            {run.consequences.registration[locale]}
          </Consequence>
          <Consequence label={t('classification.reporting')}>
            {run.consequences.reporting[locale]}
          </Consequence>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('classification.documentsTitle')}</CardTitle>
          <CardDescription>{t('classification.documentsSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {run.applicability.length === 0 ? (
            <Alert variant="info">{t('classification.documentsEmpty')}</Alert>
          ) : (
            <ol className="grid gap-2 md:grid-cols-2">
              {run.applicability.map((document) => (
                <li
                  key={document.templateKey}
                  className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {document.priority}. {document.title[locale]}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`classification.categories.${document.category}`, {
                        defaultValue: document.category,
                      })}
                    </p>
                  </div>
                  <Badge variant={document.required ? 'warning' : 'neutral'}>
                    {document.required
                      ? t('classification.required')
                      : t('classification.voluntary')}
                  </Badge>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Alert variant={run.result === 'OUT_OF_SCOPE' ? 'success' : 'warning'}>
        {t('classification.disclaimer')}
      </Alert>

      <p className="text-xs text-muted-foreground">
        {t('classification.createdAt', {
          date: formatDateTime(run.createdAt, i18n.language),
        })}
        {' · '}
        {t(`classification.confidence.${run.confidence}`)}
      </p>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-1 border-b border-border/60 pb-2 last:border-0 sm:flex-row sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function Consequence({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-4 text-sm">
      <p className="font-semibold">{label}</p>
      <div className="mt-1 text-muted-foreground">{children}</div>
    </div>
  );
}

function Citation({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs font-medium text-foreground">{children}</p>;
}
