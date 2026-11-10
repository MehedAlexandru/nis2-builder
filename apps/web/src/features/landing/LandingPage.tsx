import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Network,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

const moduleIcons = {
  classification: ShieldCheck,
  documents: FileText,
  audit: Network,
} as const;

const statusIcons = [CheckCircle2, CheckCircle2, CheckCircle2, CheckCircle2] as const;

export function LandingPage() {
  const { t } = useTranslation();
  const modules = ['classification', 'documents', 'audit'] as const;
  const statusItems = ['repo', 'design', 'i18n', 'api'] as const;

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary-100))_0%,transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary-900))_0%,transparent_55%)]"
          aria-hidden="true"
        />
        <div className="container relative py-16 md:py-24">
          <div className="max-w-3xl animate-fade-in">
            <Badge variant="primary" className="mb-5 gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t('common.phase')}
            </Badge>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">
              {t('landing.eyebrow')}
            </p>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              {t('landing.title')}
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              {t('landing.subtitle')}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" disabled title={t('actions.comingSoon')}>
                {t('actions.startClassification')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/design">{t('actions.exploreDesign')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-16" aria-labelledby="modules-title">
        <h2 id="modules-title" className="text-2xl font-semibold tracking-tight">
          {t('landing.modulesTitle')}
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {modules.map((module) => {
            const Icon = moduleIcons[module];
            return (
              <Card key={module} className="h-full">
                <CardHeader>
                  <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <CardTitle>{t(`landing.modules.${module}.title`)}</CardTitle>
                  <CardDescription className="leading-relaxed">
                    {t(`landing.modules.${module}.description`)}
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-y border-border bg-card" aria-labelledby="status-title">
        <div className="container grid gap-10 py-16 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div>
            <Badge variant="success" className="mb-4">
              {t('common.inProgress')}
            </Badge>
            <h2 id="status-title" className="text-2xl font-semibold tracking-tight">
              {t('landing.statusTitle')}
            </h2>
            <p className="mt-3 max-w-xl text-muted-foreground">{t('landing.statusBody')}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {statusItems.map((item, index) => {
              const Icon = statusIcons[index] ?? CheckCircle2;
              return (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-lg border border-border bg-background p-4"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" />
                  <span className="text-sm">{t(`landing.statusItems.${item}`)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="container py-16">
        <div
          role="note"
          className="flex items-start gap-4 rounded-xl border border-warning-500/40 bg-warning-50 p-6 dark:bg-warning-500/10"
        >
          <TriangleAlert
            className="mt-0.5 h-5 w-5 shrink-0 text-warning-700 dark:text-warning-500"
            aria-hidden="true"
          />
          <div>
            <h2 className="font-semibold text-warning-700 dark:text-warning-100">
              {t('landing.disclaimerTitle')}
            </h2>
            <p className="mt-1 text-sm text-warning-700/90 dark:text-warning-100/90">
              {t('footer.disclaimer')}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
