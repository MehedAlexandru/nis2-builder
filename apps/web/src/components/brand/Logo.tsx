import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '@nis2/shared';
import { cn } from '@/lib/cn';

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        'inline-flex items-center gap-2 rounded-md text-foreground transition-colors hover:text-primary-600 dark:hover:text-primary-300',
        className,
      )}
      aria-label={APP_NAME}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white shadow-sm dark:bg-primary-500 dark:text-primary-950">
        <Compass className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
    </Link>
  );
}
