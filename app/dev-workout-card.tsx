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
import { buildWorkoutRoute } from '@/lib/health/route';
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

/**
 * A Boise foothills-shaped out-and-back, so the projection has a real silhouette to preserve rather
 * than a circle. Stands in for an HKWorkoutRoute sample set.
 */
function previewRoute() {
  const points: Array<{ latitude: number; longitude: number; timestamp: string }> = [];
  const start = Date.parse('2026-09-04T13:25:43.056Z');
  const total = 300;
  for (let index = 0; index < total; index += 1) {
    const t = index / (total - 1);
    let lat: number;
    let lng: number;
    if (t < 0.22) {
      // Out from the trailhead.
      const leg = t / 0.22;
      lat = 43.6612 + leg * 0.008;
      lng = -116.2049 + leg * 0.004 + Math.sin(leg * 6) * 0.0006;
    } else if (t < 0.78) {
      // Loop at the top.
      const angle = ((t - 0.22) / 0.56) * Math.PI * 2 - Math.PI / 2;
      lat = 43.6692 + 0.0075 + Math.sin(angle) * 0.0075 + Math.sin(angle * 3) * 0.0011;
      lng = -116.2009 + Math.cos(angle) * 0.0102 + Math.cos(angle * 3) * 0.0013;
    } else {
      // Back down the same trail.
      const leg = 1 - (t - 0.78) / 0.22;
      lat = 43.6612 + leg * 0.008;
      lng = -116.2049 + leg * 0.004 + Math.sin(leg * 6) * 0.0006;
    }
    points.push({
      latitude: lat,
      longitude: lng,
      timestamp: new Date(start + index * 10_000).toISOString(),
    });
  }
  return buildWorkoutRoute({ locations: points, activityType: 'running' });
}

const RUNNER: HealthWorkout = {
  ...COURTNEY,
  activityType: 'running',
  activityLabel: 'Outdoor Run',
  distanceM: 8450,
  caloriesKcal: 612,
  hrAvg: 152,
  hrMax: 178,
  hrMin: 104,
};

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

      <Label>Outdoor run with GPS route</Label>
      <View style={{ width: PREVIEW_W, height: PREVIEW_H }}>
        <WorkoutProofCard
          card={buildWorkoutProofCard({
            workout: RUNNER,
            samples: previewSamples(),
            timeZone: 'America/Denver',
            challengeTitle: '30-Day Consistency',
            route: previewRoute(),
            placeLabel: 'Boise, ID',
          })}
          activityType="running"
          width={PREVIEW_W}
          height={PREVIEW_H}
          animate
        />
      </View>

      <Label>Indoor, no route (heart rate present)</Label>
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
