import type { ReactNode } from 'react';

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#E8EBE8] p-3">
      <div className="relative flex h-[min(844px,100dvh)] w-full max-w-[390px] flex-col overflow-hidden rounded-[32px] border border-line bg-bg shadow-card">
        {children}
      </div>
    </div>
  );
}
