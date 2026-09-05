import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { WorkoutProofCard } from '@/components/challenge/WorkoutProofCard';
import { WorkoutStatChips } from '@/components/challenge/WorkoutStatChips';
import { AppText } from '@/components/ui/AppText';
import {
  buildWorkoutProofCard,
  WORKOUT_CARD_HEIGHT,
  WORKOUT_CARD_WIDTH,
  type HeartRateSample,
} from '@/lib/health/workoutProofCard';
import { proofStatChips, proofStatsProse } from '@/lib/checkin/proofStats';
import type { OcrSessionFields } from '@/lib/health/ocrSession';
import { THEME } from '@/lib/theme';
import { humanizeActivityLabel } from '@/services/health/apple';
import type { HealthWorkout } from '@/services/health/types';

/**
 * Design preview for the workout proof card. Not linked from the app; open /dev-workout-card on
 * web to check layout without an EAS build. Numbers below are Courtney's real 2026-09-04 Watch
 * workout as stored in health_workouts.
 */
const COURTNEY: HealthWorkout = {
  providerWorkoutId: 'preview-workout',
  source: 'apple_health',
  activityType: 'strength',
  activityLabel: humanizeActivityLabel('HighIntensityIntervalTraining'),
  startedAt: '2026-09-04T13:25:43.056Z',
  endedAt: '2026-09-04T14:15:44.562Z',
  durationSec: 3002,
  caloriesKcal: 275,
  hrAvg: 137,
  hrMax: 174,
  hrMin: 96,
  confidence: 'watch',
};

/**
 * The HR series is never persisted (health_workouts is summary-only), so this preview shapes a
 * plausible curve that honours the stored min/avg/max. A real attach graphs the live samples.
 */
function previewSamples(): HeartRateSample[] {
  const shape = [
    96, 104, 118, 131, 142, 150, 146, 138, 129, 141, 155, 163, 158, 147, 136, 144, 157, 168, 174,
    166, 152, 140, 133, 145, 154, 149, 137, 126, 118, 108,
  ];
  const start = Date.parse(COURTNEY.startedAt);
  const step = (Date.parse(COURTNEY.endedAt) - start) / (shape.length - 1);
  return shape.map((bpm, index) => ({ at: new Date(start + index * step).toISOString(), bpm }));
}

const PREVIEW_W = 360;
const PREVIEW_H = (PREVIEW_W * WORKOUT_CARD_HEIGHT) / WORKOUT_CARD_WIDTH;

function Label({ children }: { children: string }) {
  return (
    <AppText className="mb-2 mt-6 text-[13px] font-bold" style={{ color: THEME.textPrimary }}>
      {children}
    </AppText>
  );
}

export default function DevWorkoutCardScreen() {
  // Stands in for what the screenshot reader returned for a tracker slot.
  const [readFields, setReadFields] = useState<OcrSessionFields>({
    durationSec: 2470,
    activeEnergyKcal: 312,
    avgHrBpm: 108,
    maxHrBpm: 147,
    distanceMeters: 5150,
  });

  const withHr = buildWorkoutProofCard({
    workout: COURTNEY,
    samples: previewSamples(),
    timeZone: 'America/Denver',
    challengeTitle: '30-Day Consistency',
  });
  const noHr = buildWorkoutProofCard({
    workout: { ...COURTNEY, hrAvg: undefined, hrMax: undefined, hrMin: undefined },
    samples: [],
    timeZone: 'America/Denver',
    challengeTitle: '30-Day Consistency',
  });
  const stats = {
    activity: 'strength',
    duration_sec: 3002,
    active_cal: 275,
    hr_avg: 137,
    hr_max: 174,
    pronoun: 'she',
  };

  return (
    <ScrollView style={{ backgroundColor: THEME.background }} contentContainerStyle={{ padding: 16 }}>
      <AppText className="text-[18px] font-bold" style={{ color: THEME.textPrimary }}>
        Workout proof card preview
      </AppText>
      <AppText className="mt-1 text-[12px]" style={{ color: THEME.textMuted }}>
        Courtney · 2026-09-04 · HIIT · 50:02 · 275 cal · avg 137 / max 174
      </AppText>

      <Label>With heart rate</Label>
      <View style={{ width: PREVIEW_W, height: PREVIEW_H }}>
        <WorkoutProofCard
          card={withHr}
          activityType={COURTNEY.activityType}
          width={PREVIEW_W}
          height={PREVIEW_H}
        />
      </View>

      <Label>No heart rate on the workout</Label>
      <View style={{ width: PREVIEW_W, height: PREVIEW_H }}>
        <WorkoutProofCard
          card={noHr}
          activityType={COURTNEY.activityType}
          width={PREVIEW_W}
          height={PREVIEW_H}
        />
      </View>

      <Label>Post stats chips + prose</Label>
      <View style={{ gap: 6 }}>
        <AppText className="text-[12px]" style={{ color: THEME.textMuted }}>
          {proofStatChips(stats)
            .map((chip) => chip.label)
            .join('  ·  ')}
        </AppText>
        <AppText className="text-[13px]" style={{ color: THEME.textPrimary }}>
          {proofStatsProse({ stats, displayName: 'Courtney' }) ?? '(no prose)'}
        </AppText>
      </View>
      <Label>Read stat chips (tap to correct)</Label>
      <AppText className="mb-2 text-[12px]" style={{ color: THEME.textMuted }}>
        What sits under a tracker screenshot on the composer hero. Tap a chip, type, blur to clamp.
      </AppText>
      <WorkoutStatChips fields={readFields} onChange={setReadFields} />
      <AppText className="mt-2 text-[11px]" style={{ color: THEME.textMuted }}>
        {JSON.stringify(readFields)}
      </AppText>

      <Label>Reading / soft-fail lines</Label>
      <AppText className="text-[12px]" style={{ color: THEME.textMuted }}>
        Reading workout…
      </AppText>
      <AppText className="text-[12px]" style={{ color: THEME.textMuted }}>
        Couldn’t read numbers. You can still send.
      </AppText>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}
