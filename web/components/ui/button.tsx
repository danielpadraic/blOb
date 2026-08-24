import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '~/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-blob text-[15px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 min-h-11 px-5',
  {
    variants: {
      variant: {
        default: 'bg-black text-white hover:bg-ink',
        outline: 'border border-line bg-surface text-ink',
        ghost: 'text-teal',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, className }))} {...props} />;
}
