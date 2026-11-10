import { useTranslation } from 'react-i18next';
import { brand } from '@nis2/shared';
import { Badge, SeverityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/format';

const primaryShades = Object.entries(brand.primary) as Array<[string, string]>;

const semanticAnchors = [
  { name: 'success-600', value: brand.success[600] },
  { name: 'warning-500', value: brand.warning[500] },
  { name: 'danger-600', value: brand.danger[600] },
  { name: 'accent-600', value: brand.accent[600] },
] as const;

const severitySample = [
  { severity: 'LOW' as const, key: 'severity.low' as const },
  { severity: 'MEDIUM' as const, key: 'severity.medium' as const },
  { severity: 'HIGH' as const, key: 'severity.high' as const },
  { severity: 'CRITICAL' as const, key: 'severity.critical' as const },
];

export function DesignSystemPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sampleDate = new Date('2026-11-10T12:00:00Z');

  return (
    <div className="container py-12">
      <header className="max-w-3xl">
        <Badge variant="primary" className="mb-4">
          {t('nav.design')}
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('design.title')}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{t('design.subtitle')}</p>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('design.palette')}</CardTitle>
            <CardDescription>{t('design.paletteHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {primaryShades.map(([shade, value]) => {
                const lightText = Number(shade) >= 500;
                return (
                  <div key={shade} className="overflow-hidden rounded-lg border border-border">
                    <div
                      className="flex h-20 items-end p-2 text-xs font-semibold"
                      style={{
                        backgroundColor: value,
                        color: lightText ? '#fff' : brand.primary[950],
                      }}
                    >
                      {shade}
                    </div>
                    <div className="bg-card p-2 text-[11px] text-muted-foreground">{value}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('design.semantic')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {semanticAnchors.map((token) => (
              <div key={token.name} className="overflow-hidden rounded-lg border border-border">
                <div className="h-16" style={{ backgroundColor: token.value }} />
                <div className="bg-card p-2 text-xs">
                  <div className="font-semibold">{token.name}</div>
                  <div className="text-muted-foreground">{token.value}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('design.severity')}</CardTitle>
            <CardDescription>{t('design.severityHint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {severitySample.map((item) => (
              <SeverityBadge key={item.severity} severity={item.severity} label={t(item.key)} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('design.typography')}</CardTitle>
            <CardDescription>{t('design.typographyHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-bold tracking-tight">Heading 1</p>
            <p className="text-2xl font-semibold tracking-tight">Heading 2</p>
            <p className="text-xl font-semibold">Heading 3</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Body copy at 14px with relaxed leading. The quick brown fox jumps over the lazy dog.
              0123456789 — €%·.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('design.components')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button>{t('design.buttonPrimary')}</Button>
            <Button variant="secondary">{t('design.buttonSecondary')}</Button>
            <Button variant="outline">{t('design.buttonOutline')}</Button>
            <Button variant="ghost">{t('design.buttonGhost')}</Button>
            <Button variant="danger">{t('design.buttonDanger')}</Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('design.progress')}</CardTitle>
            <CardDescription>{t('design.progressHint')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            <Progress value={15} label="15%" />
            <Progress value={52} label="52%" />
            <Progress value={100} label="100%" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('design.formatting')}</CardTitle>
            <CardDescription>{t('design.formattingHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t('design.sampleDate')}</dt>
              <dd className="font-medium tabular-nums">{formatDate(sampleDate, locale)}</dd>
              <dt className="text-muted-foreground">{t('design.sampleNumber')}</dt>
              <dd className="font-medium tabular-nums">{formatNumber(1234567.89, locale)}</dd>
              <dt className="text-muted-foreground">{t('design.sampleCurrency')}</dt>
              <dd className="font-medium tabular-nums">{formatCurrency(125000, locale)}</dd>
              <dt className="text-muted-foreground">%</dt>
              <dd className="font-medium tabular-nums">{formatPercent(72, locale)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('design.accessibility')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('design.accessibilityBody')}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
