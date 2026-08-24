import Image from 'next/image';

import { cn } from '~/lib/utils';

export function Bob({
  line,
  title,
  compact,
}: {
  title?: string;
  line: string;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center bg-transparent px-6 py-8 text-center">
      <Image
        src="/bob.png"
        alt="Bob"
        width={compact ? 96 : 168}
        height={compact ? 96 : 168}
        className={cn('bg-transparent', compact ? 'h-24 w-24' : 'h-40 w-40')}
        priority
      />
      {title ? <p className="mt-4 text-2xl font-bold text-ink">{title}</p> : null}
      <p className="mt-2 max-w-[280px] text-sm leading-6 text-muted">{line}</p>
    </div>
  );
}
