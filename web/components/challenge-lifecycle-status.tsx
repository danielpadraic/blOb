import { LIFECYCLE_PHASES, lifecyclePhase, type LifecyclePhase } from '@/lib/settlement/lifecycle';

const LABELS: Record<LifecyclePhase, string> = {
  open: 'Open',
  live: 'Live',
  settling: 'Settling',
  settled: 'Settled',
};

export function ChallengeLifecycleStatus({
  status,
  compact = false,
}: {
  status?: string | null;
  compact?: boolean;
}) {
  const current = lifecyclePhase(status);
  const phases = compact ? ([current] as LifecyclePhase[]) : LIFECYCLE_PHASES;
  return (
    <div className="flex flex-wrap gap-2">
      {phases.map((phase) => {
        const active = phase === current;
        return (
          <span
            key={phase}
            className={`inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-bold ${
              active ? 'bg-teal-soft text-teal' : 'border border-line text-muted'
            }`}>
            {LABELS[phase]}
          </span>
        );
      })}
    </div>
  );
}
