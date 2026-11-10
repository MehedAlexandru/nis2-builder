import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-primary-600 text-white shadow-sm hover:bg-primary-700 dark:bg-primary-500 dark:text-primary-950 dark:hover:bg-primary-400',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-neutral-200 dark:hover:bg-neutral-700',
        outline: 'border border-input bg-background hover:bg-muted',
        ghost: 'hover:bg-muted',
        danger: 'bg-danger-600 text-white shadow-sm hover:bg-danger-700',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-11 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
