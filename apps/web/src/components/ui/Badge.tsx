import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import type { Severity } from '@nis2/shared';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-foreground',
        primary: 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-200',
        success: 'bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-100',
        warning: 'bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100',
        danger: 'bg-danger-100 text-danger-700 dark:bg-danger-700/30 dark:text-danger-100',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const severityClass: Record<Severity, string> = {
  LOW: 'severity-low',
  MEDIUM: 'severity-medium',
  HIGH: 'severity-high',
  CRITICAL: 'severity-critical',
};

const severityLabel: Record<Severity, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export function SeverityBadge({
  severity,
  label,
  className,
}: {
  severity: Severity;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn('severity-badge', severityClass[severity], className)}>
      {label ?? severityLabel[severity]}
    </span>
  );
}
