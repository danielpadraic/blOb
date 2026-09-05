import { NativeModules, Platform } from 'react-native';

import { buildWorkoutRoute, type WorkoutRoute } from '@/lib/health/route';

import {
  clearLocalHealthStatus,
  readLocalHealthStatus,
  writeLocalHealthStatus,
} from '@/services/health/local';
import type {
  HealthAccessResult,
  HealthActivityType,
  HealthAuthStatus,
  HealthAvailabilityDetail,
  HealthConfidence,
  HealthHeartRateSample,
  HealthProvider,
  HealthSyncResult,
  HealthWorkout,
} from '@/services/health/types';

type HealthStatusCode = 0 | 1 | 2;

type NativeKit = {
  Constants: {
    Permissions: Record<string, string>;
  };
  isAvailable: (callback: (error: unknown, available: boolean) => void) => void;
  initHealthKit: (
    permissions: { permissions: { read: string[]; write: string[] } },
    callback: (error: string, result: unknown) => void,
  ) => void;
  getAuthStatus: (
    permissions: { permissions: { read: string[]; write: string[] } },
    callback: (error: string, results: { permissions?: { read?: HealthStatusCode[] } }) => void,
  ) => void;
  getAnchoredWorkouts: (
    options: { startDate?: string; endDate?: string; anchor?: string },
    callback: (
      error: { message?: string } | string | null,
      results: { data?: NativeWorkout[]; anchor?: string; deleted?: Array<{ id?: string }> },
    ) => void,
  ) => void;
  getHeartRateSamples: (
    options: { startDate: string; endDate: string; ascending?: boolean; limit?: number; unit?: string },
    callback: (
      error: string,
      results: Array<{ value?: number; startDate?: string; endDate?: string }>,
    ) => void,
  ) => void;
  getWorkoutRouteSamples?: (
    options: { id: string },
    callback: (
      error: string | { message?: string } | null,
      results: { data?: { locations?: unknown[] } } | null,
    ) => void,
  ) => void;
  setObserver?: (options: { type: string }) => void;
};

type NativeWorkout = {
  id?: string;
  activityName?: string;
  activityId?: number;
  calories?: number;
  tracked?: boolean;
  sourceName?: string;
  sourceId?: string;
  device?: string;
  start?: string;
  end?: string;
  duration?: number;
  distance?: number;
};

const SharingDenied = 1;

/** A route read that has not answered by now is treated as "no route". */
const ROUTE_TIMEOUT_MS = 8000;

function loadKit(): NativeKit | null {
  if (Platform.OS !== 'ios') {
    return null;
  }
  try {
    const native = (NativeModules as { AppleHealthKit?: Omit<NativeKit, 'Constants'> }).AppleHealthKit;
    if (!native || typeof native.initHealthKit !== 'function') {
      return null;
    }
    // UI must never import this module at top level. Constants are JS-only.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-health') as {
      Constants?: NativeKit['Constants'];
      default?: { Constants?: NativeKit['Constants'] };
    };
    const constants = mod.Constants ?? mod.default?.Constants;
    if (!constants?.Permissions) {
      return null;
    }
    return {
      Constants: constants,
      isAvailable:
        typeof native.isAvailable === 'function'
          ? native.isAvailable.bind(native)
          : (callback) => callback(null, true),
      initHealthKit: native.initHealthKit.bind(native),
      getAuthStatus:
        typeof native.getAuthStatus === 'function'
          ? native.getAuthStatus.bind(native)
          : ((_permissions, callback) => callback('', {})),
      getAnchoredWorkouts:
        typeof native.getAnchoredWorkouts === 'function'
          ? native.getAnchoredWorkouts.bind(native)
          : ((_options, callback) => callback(null, { data: [] })),
      getHeartRateSamples:
        typeof native.getHeartRateSamples === 'function'
          ? native.getHeartRateSamples.bind(native)
          : ((_options, callback) => callback('', [])),
      getWorkoutRouteSamples:
        typeof native.getWorkoutRouteSamples === 'function'
          ? native.getWorkoutRouteSamples.bind(native)
          : undefined,
      setObserver: typeof native.setObserver === 'function' ? native.setObserver.bind(native) : undefined,
    };
  } catch {
    return null;
  }
}

function readPermissions(kit: NativeKit): string[] {
  const p = kit.Constants?.Permissions ?? {};
  return [
    p.Workout,
    p.HeartRate,
    p.ActiveEnergyBurned,
    p.DistanceWalkingRunning,
    // Route is a separate HealthKit series type. Without it an outdoor workout still attaches, it
    // just arrives with no map.
    p.WorkoutRoute,
  ].filter(Boolean);
}

function permissionPayload(kit: NativeKit, writeWorkout = false) {
  const workout = kit.Constants?.Permissions?.Workout;
  return {
    permissions: {
      read: readPermissions(kit),
      write: writeWorkout && workout ? [workout] : [],
    },
  };
}

function asErrorMessage(error: unknown): string {
  if (!error) {
    return '';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '';
}

/**
 * react-native-health returns the raw HKWorkoutActivityType name, e.g.
 * "HighIntensityIntervalTraining" or "TraditionalStrengthTraining". Split it into words so the
 * proof card and the challenge list read like English instead of a symbol name.
 */
export function humanizeActivityLabel(raw: string): string {
  const name = String(raw ?? '').trim();
  if (!name) {
    return 'Workout';
  }
  // Already spaced (or already human) labels are left alone.
  if (name.includes(' ')) {
    return name;
  }
  const spaced = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return spaced || 'Workout';
}

function mapActivity(label: string): HealthActivityType {
  const name = label.toLowerCase();
  if (name.includes('run')) {
    return 'running';
  }
  if (name.includes('walk') || name.includes('hik')) {
    return 'walking';
  }
  if (name.includes('cycl') || name.includes('bike')) {
    return 'cycling';
  }
  if (
    name.includes('strength') ||
    name.includes('weight') ||
    name.includes('core') ||
    name.includes('functional') ||
    name.includes('hiit') ||
    name.includes('interval') ||
    name.includes('cross training')
  ) {
    return 'strength';
  }
  return 'other';
}

function mapConfidence(workout: NativeWorkout): HealthConfidence {
  const bundle = `${workout.sourceId ?? ''} ${workout.sourceName ?? ''} ${workout.device ?? ''}`.toLowerCase();
  if (workout.tracked === false || workout.sourceId === 'com.apple.Health') {
    return 'manual';
  }
  if (bundle.includes('watchos') || bundle.includes('apple watch') || bundle.includes('watch')) {
    return 'watch';
  }
  if (bundle.includes('iphone') || bundle.includes('mobilefitness') || bundle.includes('fitness')) {
    return 'phone';
  }
  return 'unknown';
}

function durationSecOf(workout: NativeWorkout, startedAt: Date, endedAt: Date): number {
  const fromRange = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  const raw = Number(workout.duration);
  if (!Number.isFinite(raw) || raw <= 0) {
    return fromRange;
  }
  // Library mixes minutes and seconds; prefer the timestamp span when it looks real.
  if (fromRange >= 30) {
    return fromRange;
  }
  return raw > 180 ? Math.round(raw) : Math.round(raw * 60);
}

function asIso(value: string | undefined, fallback: Date): string {
  if (!value) {
    return fallback.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function mapWorkout(workout: NativeWorkout): HealthWorkout | null {
  const startedAt = new Date(workout.start ?? '');
  const endedAt = new Date(workout.end ?? '');
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime()) || endedAt <= startedAt) {
    return null;
  }
  const label = humanizeActivityLabel(String(workout.activityName ?? ''));
  const providerWorkoutId =
    String(workout.id ?? '').trim() ||
    `${startedAt.toISOString()}-${endedAt.toISOString()}-${label}`;
  return {
    providerWorkoutId,
    source: 'apple_health',
    activityType: mapActivity(label),
    activityLabel: label,
    startedAt: asIso(workout.start, startedAt),
    endedAt: asIso(workout.end, endedAt),
    durationSec: durationSecOf(workout, startedAt, endedAt),
    caloriesKcal: asNumber(workout.calories),
    distanceM: asNumber(workout.distance),
    sourceBundle: workout.sourceId ?? workout.sourceName ?? undefined,
    confidence: mapConfidence(workout),
  };
}

/** Raw BPM rows for a window. Ascending so the proof card graphs left to right. */
async function heartRateSamplesFor(
  kit: NativeKit,
  startedAt: string,
  endedAt: string,
): Promise<HealthHeartRateSample[]> {
  try {
    const rows = await new Promise<Array<{ value?: number; startDate?: string; endDate?: string }>>(
      (resolve) => {
        kit.getHeartRateSamples(
          { startDate: startedAt, endDate: endedAt, ascending: true, limit: 400, unit: 'bpm' },
          (error, results) => {
            if (error || !Array.isArray(results)) {
              resolve([]);
              return;
            }
            resolve(results);
          },
        );
      },
    );
    const samples: HealthHeartRateSample[] = [];
    for (const row of rows) {
      const bpm = Number(row.value);
      if (!Number.isFinite(bpm) || bpm <= 0) {
        continue;
      }
      const at = String(row.startDate ?? row.endDate ?? '').trim();
      samples.push({ at: at || startedAt, bpm: Math.round(bpm) });
    }
    return samples;
  } catch {
    return [];
  }
}

async function heartRateFor(
  kit: NativeKit,
  startedAt: string,
  endedAt: string,
): Promise<{ hrAvg?: number; hrMax?: number }> {
  try {
    const samples = await new Promise<Array<{ value?: number }>>((resolve) => {
      kit.getHeartRateSamples(
        { startDate: startedAt, endDate: endedAt, ascending: false, limit: 200, unit: 'bpm' },
        (error, results) => {
          if (error || !Array.isArray(results)) {
            resolve([]);
            return;
          }
          resolve(results);
        },
      );
    });
    const values = samples.map((row) => Number(row.value)).filter((value) => Number.isFinite(value) && value > 0);
    if (values.length === 0) {
      return {};
    }
    const sum = values.reduce((total, value) => total + value, 0);
    return {
      hrAvg: Math.round(sum / values.length),
      hrMax: Math.round(Math.max(...values)),
    };
  } catch {
    return {};
  }
}

class AppleHealthProvider implements HealthProvider {
  isAvailable(): boolean {
    if (Platform.OS !== 'ios') {
      return false;
    }
    return loadKit() != null;
  }

  async getAvailabilityDetail(): Promise<HealthAvailabilityDetail> {
    // initHealthKit present means we can show the system sheet. Do not treat a
    // timed-out isAvailable probe as unavailable.
    return loadKit() ? 'ready' : 'unavailable';
  }

  async getAuthStatus(): Promise<HealthAuthStatus> {
    const kit = loadKit();
    if (!kit) {
      return 'unknown';
    }
    const local = await readLocalHealthStatus();
    if (local === 'connected') {
      return 'connected';
    }
    if (local === 'denied') {
      return 'denied';
    }
    try {
      const native = await new Promise<HealthAuthStatus>((resolve) => {
        kit.getAuthStatus(permissionPayload(kit), (error, results) => {
          if (error) {
            resolve('unknown');
            return;
          }
          const reads = results?.permissions?.read ?? [];
          if (reads.length > 0 && reads.every((code) => code === SharingDenied)) {
            resolve('denied');
            return;
          }
          resolve('unknown');
        });
      });
      return native;
    } catch {
      return 'unknown';
    }
  }

  async requestAccess(): Promise<HealthAccessResult> {
    const kit = loadKit();
    if (!kit) {
      return 'unavailable';
    }
    try {
      const result = await new Promise<HealthAccessResult>((resolve) => {
        kit.initHealthKit(permissionPayload(kit), (error) => {
          const message = asErrorMessage(error).toLowerCase();
          if (message) {
            if (message.includes('unavailable') || message.includes('not available')) {
              resolve('unavailable');
              return;
            }
            resolve('denied');
            return;
          }
          resolve('connected');
        });
      });
      if (result === 'connected') {
        await writeLocalHealthStatus('connected');
        void this.enableBackgroundSync();
      } else if (result === 'denied') {
        await writeLocalHealthStatus('denied');
      }
      return result;
    } catch {
      await writeLocalHealthStatus('denied');
      return 'denied';
    }
  }

  async requestWorkoutWrite(): Promise<HealthAccessResult> {
    const kit = loadKit();
    if (!kit) {
      return 'unavailable';
    }
    try {
      const result = await new Promise<HealthAccessResult>((resolve) => {
        kit.initHealthKit(permissionPayload(kit, true), (error) => {
          const message = asErrorMessage(error).toLowerCase();
          if (message) {
            if (message.includes('unavailable') || message.includes('not available')) {
              resolve('unavailable');
              return;
            }
            resolve('denied');
            return;
          }
          resolve('connected');
        });
      });
      if (result === 'connected') {
        await writeLocalHealthStatus('connected');
      }
      return result;
    } catch {
      return 'denied';
    }
  }

  async disconnectLocal(): Promise<void> {
    await clearLocalHealthStatus();
  }

  async fetchWorkouts(params: { from: Date; to: Date }): Promise<HealthWorkout[]> {
    const kit = await this.readyKit();
    if (!kit) {
      return [];
    }
    try {
      const pulled = await pullAnchored(kit, {
        startDate: params.from.toISOString(),
        endDate: params.to.toISOString(),
      });
      const withHr = await Promise.all(
        pulled.workouts.map(async (workout) => this.enrichHeartRate(workout)),
      );
      return withHr.sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1));
    } catch {
      return [];
    }
  }

  /**
   * Incremental HKAnchoredObjectQuery. react-native-health 1.19 does not expose
   * enableBackgroundDelivery cleanly, so AppState 'active' calls this. setObserver
   * is best-effort if the module has it.
   */
  async syncNewWorkouts(anchor?: string | null): Promise<HealthSyncResult> {
    const kit = await this.readyKit();
    if (!kit) {
      return { workouts: [], nextAnchor: anchor ?? null, deletedIds: [] };
    }
    try {
      const options = anchor ? { anchor } : { startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() };
      const pulled = await pullAnchored(kit, options);
      const withHr = await Promise.all(
        pulled.workouts.map(async (workout) => this.enrichHeartRate(workout)),
      );
      return {
        workouts: withHr,
        nextAnchor: pulled.anchor ?? anchor ?? null,
        deletedIds: pulled.deletedIds,
      };
    } catch {
      return { workouts: [], nextAnchor: anchor ?? null, deletedIds: [] };
    }
  }

  async enrichHeartRate(workout: HealthWorkout): Promise<HealthWorkout> {
    if (workout.hrAvg || workout.hrMax) {
      return workout;
    }
    const kit = loadKit();
    if (!kit) {
      return workout;
    }
    const hr = await heartRateFor(kit, workout.startedAt, workout.endedAt);
    return { ...workout, ...hr };
  }

  async fetchHeartRateSeries(window: {
    startedAt: string;
    endedAt: string;
  }): Promise<HealthHeartRateSample[]> {
    const kit = loadKit();
    if (!kit) {
      return [];
    }
    return heartRateSamplesFor(kit, window.startedAt, window.endedAt);
  }

  /**
   * Reads the GPS track for one workout.
   *
   * Returns null for indoor workouts, for a binary without the route reader, and when the user
   * declined route access. Callers show the card with no map rather than a placeholder line, and
   * this never asks for ongoing location — the track already belongs to the saved workout.
   */
  async fetchWorkoutRoute(
    workout: Pick<HealthWorkout, 'providerWorkoutId' | 'activityType'>,
  ): Promise<WorkoutRoute | null> {
    const kit = loadKit();
    const id = String(workout?.providerWorkoutId ?? '').trim();
    if (!kit?.getWorkoutRouteSamples || !id) {
      return null;
    }
    try {
      const locations = await new Promise<unknown[]>((resolve) => {
        // Route reads can hang when HealthKit has nothing to hand back. The card must not wait.
        const timer = setTimeout(() => resolve([]), ROUTE_TIMEOUT_MS);
        kit.getWorkoutRouteSamples?.({ id }, (error, results) => {
          clearTimeout(timer);
          if (error || !results?.data?.locations || !Array.isArray(results.data.locations)) {
            resolve([]);
            return;
          }
          resolve(results.data.locations);
        });
      });
      if (locations.length === 0) {
        return null;
      }
      return buildWorkoutRoute({ locations, activityType: workout.activityType });
    } catch {
      return null;
    }
  }

  async enableBackgroundSync(): Promise<void> {
    const kit = await this.readyKit();
    if (!kit?.setObserver) {
      return;
    }
    try {
      kit.setObserver({ type: 'Workout' });
    } catch {
      // Observer is optional. Foreground sync on AppState 'active' is the reliable path.
    }
  }

  private async readyKit(): Promise<NativeKit | null> {
    return loadKit();
  }
}

async function pullAnchored(
  kit: NativeKit,
  options: { startDate?: string; endDate?: string; anchor?: string },
): Promise<{ workouts: HealthWorkout[]; anchor: string | null; deletedIds: string[] }> {
  const results = await new Promise<{
    data: NativeWorkout[];
    anchor: string | null;
    deletedIds: string[];
  }>((resolve) => {
    kit.getAnchoredWorkouts(options, (error, payload) => {
      if (error) {
        resolve({ data: [], anchor: options.anchor ?? null, deletedIds: [] });
        return;
      }
      resolve({
        data: Array.isArray(payload?.data) ? payload.data : [],
        anchor: typeof payload?.anchor === 'string' && payload.anchor ? payload.anchor : (options.anchor ?? null),
        deletedIds: (payload?.deleted ?? [])
          .map((row) => String(row.id ?? '').trim())
          .filter(Boolean),
      });
    });
  });
  return {
    workouts: results.data.map(mapWorkout).filter((row): row is HealthWorkout => Boolean(row)),
    anchor: results.anchor,
    deletedIds: results.deletedIds,
  };
}

export const appleHealth: HealthProvider = new AppleHealthProvider();
