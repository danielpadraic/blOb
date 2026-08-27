import { useQuery } from '@tanstack/react-query';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { fetchHealthWorkoutById } from '@/lib/health/remote';
import { healthProofLines } from '@/lib/health/proofSummary';
import { THEME } from '@/lib/theme';

export function HealthProofCaption({
  healthWorkoutId,
  fromLibrary,
}: {
  healthWorkoutId?: string | null;
  fromLibrary?: boolean;
}) {
  const workout = useQuery({
    queryKey: ['health-workout', healthWorkoutId],
    enabled: Boolean(healthWorkoutId),
    queryFn: () => fetchHealthWorkoutById(healthWorkoutId!),
  });
  const row = workout.data;
  if (row) {
    const lines = healthProofLines({
      activityLabel: row.activity_label,
      durationSec: row.duration_sec,
      confidence: row.confidence,
      hrAvg: row.hr_avg,
      caloriesKcal: row.calories_kcal,
      distanceMeters: row.distance_m,
      hasRoute: false,
    });
    return (
      <ViewBlock primary={lines.primary} secondary={lines.secondary} />
    );
  }
  if (fromLibrary) {
    return (
      <AppText className="text-sm text-muted">{copy('health.libraryBadge')}</AppText>
    );
  }
  return <AppText className="text-sm text-muted">{copy('health.liveBadge')}</AppText>;
}

function ViewBlock({ primary, secondary }: { primary: string; secondary: string | null }) {
  return (
    <>
      <AppText className="text-sm font-semibold text-charcoal">{primary}</AppText>
      {secondary ? (
        <AppText className="mt-0.5 text-[12px] text-muted">{secondary}</AppText>
      ) : null}
    </>
  );
}

export function CaptureSourceBadge({ fromLibrary }: { fromLibrary?: boolean }) {
  return (
    <AppText className="text-[12px] font-semibold" style={{ color: THEME.accent }}>
      {fromLibrary ? copy('health.libraryBadge') : copy('health.liveBadge')}
    </AppText>
  );
}
