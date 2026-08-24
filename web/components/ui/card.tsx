import type { HTMLAttributes } from 'react';

import { cn } from '~/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-blob border border-line bg-surface p-4 shadow-card', className)}
      {...props}
    />
  );
}
