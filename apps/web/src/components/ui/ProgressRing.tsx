import { cn } from '@/lib/cn';

export function ProgressRing({
  value,
  label,
  size = 112,
  className,
}: {
  value: number;
  label: string;
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${clamped}%`}
    >
      <svg
        viewBox="0 0 100 100"
        className="-rotate-90"
        width={size}
        height={size}
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          className="stroke-neutral-200 dark:stroke-neutral-800"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-primary-600 transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none dark:stroke-primary-300"
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-bold tabular-nums">{clamped}%</p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
