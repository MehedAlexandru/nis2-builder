import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">
        404
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{t('notFound.title')}</h1>
      <p className="mt-3 max-w-md text-muted-foreground">{t('notFound.body')}</p>
      <Button asChild className="mt-8">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('actions.backHome')}
        </Link>
      </Button>
    </div>
  );
}
