import {
  bucketBodyPoints,
  exerciseSampleMinutes,
  sleepMinutesFromSamples,
  type BodyDay,
  type BodyPoint,
} from '@/lib/health/bodyDays';

type Sample = { value?: number | string; startDate?: string; endDate?: string };

type SampleReader = (
  options: { startDate: string; endDate: string },
  callback: (error: unknown, results: Sample[] | null) => void,
) => void;

export type AppleBodyKit = {
  getDailyStepCountSamples?: SampleReader;
  getActiveEnergyBurned?: SampleReader;
  getAppleExerciseTime?: SampleReader;
  getAppleStandTime?: SampleReader;
  getSleepSamples?: SampleReader;
  getRestingHeartRateSamples?: SampleReader;
  getRestingHeartRate?: SampleReader;
};

function readSamples(reader: SampleReader | undefined, from: Date, to: Date): Promise<Sample[]> {
  if (!reader) {
    return Promise.resolve([]);
  }
  return new Promise((resolve) => {
    try {
      reader({ startDate: from.toISOString(), endDate: to.toISOString() }, (error, results) => {
        if (error || !Array.isArray(results)) {
          resolve([]);
          return;
        }
        resolve(results);
      });
    } catch {
      resolve([]);
    }
  });
}

function numericPoints(samples: Sample[], kind: BodyPoint['kind']): BodyPoint[] {
  const points: BodyPoint[] = [];
  for (const sample of samples) {
    const value = Number(sample.value);
    const at = String(sample.startDate ?? sample.endDate ?? '');
    if (!at || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    points.push({ at, value, kind });
  }
  return points;
}

/** HealthKit body samples for the window. Each series is skipped when that method is missing. */
export async function readAppleBodyDays(
  kit: AppleBodyKit,
  params: { from: Date; to: Date; timeZone: string },
): Promise<BodyDay[]> {
  const [steps, move, exercise, stand, sleep, heart] = await Promise.all([
    readSamples(kit.getDailyStepCountSamples, params.from, params.to),
    readSamples(kit.getActiveEnergyBurned, params.from, params.to),
    readSamples(kit.getAppleExerciseTime, params.from, params.to),
    readSamples(kit.getAppleStandTime, params.from, params.to),
    readSamples(kit.getSleepSamples, params.from, params.to),
    readSamples(kit.getRestingHeartRateSamples ?? kit.getRestingHeartRate, params.from, params.to),
  ]);
  const sleepPoints: BodyPoint[] = sleepMinutesFromSamples(
    sleep.map((sample) => ({
      start: sample.startDate,
      end: sample.endDate,
      value: sample.value == null ? null : String(sample.value),
    })),
  ).map((row) => ({ at: row.at, value: row.minutes, kind: 'sleepMin' as const }));
  return bucketBodyPoints(
    [
      ...numericPoints(steps, 'steps'),
      ...numericPoints(move, 'moveKcal'),
      ...exercise.map((sample) => {
        const at = String(sample.startDate ?? sample.endDate ?? '');
        const minutes = exerciseSampleMinutes(Number(sample.value), sample.startDate, sample.endDate);
        return at && minutes > 0 ? { at, value: minutes, kind: 'exerciseMin' as const } : null;
      }).filter((point): point is BodyPoint => Boolean(point)),
      ...numericPoints(stand, 'standMin'),
      ...sleepPoints,
      ...numericPoints(heart, 'heart'),
    ],
    params.timeZone,
    'apple_health',
  );
}
