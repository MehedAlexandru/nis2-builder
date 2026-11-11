import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

const variants: Record<AlertVariant, string> = {
  info: 'border-primary-300 bg-primary-50 text-primary-900 dark:bg-primary-500/10 dark:text-primary-100',
  success:
    'border-success-500/40 bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-100',
  warning:
    'border-warning-500/40 bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-100',
  danger:
    'border-danger-500/40 bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-100',
};

export function Alert({
  variant = 'info',
  title,
  children,
  role,
}: {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  role?: 'alert' | 'status' | 'note';
}) {
  return (
    <div role={role ?? 'note'} className={cn('rounded-lg border p-4 text-sm', variants[variant])}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  );
}
