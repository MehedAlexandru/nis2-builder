import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { Card, CardContent } from '@/components/ui/Card';

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="container flex max-w-lg flex-col gap-6 py-12">
      <div className="flex flex-col gap-2">
        <Logo />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <Card>
        <CardContent className="p-6">{children}</CardContent>
      </Card>
      {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  );
}
