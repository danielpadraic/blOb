import { cn } from '~/lib/utils';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex min-h-11 w-full rounded-2xl border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-teal',
        className,
      )}
      {...props}
    />
  );
}
