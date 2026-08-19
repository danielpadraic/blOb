import { Linking, Platform } from 'react-native';

import { readLocalHealthStatus, writeLocalHealthStatus } from '@/services/health/local';
import type {
  HealthAccessResult,
  HealthActivityType,
  HealthAuthStatus,
  HealthAvailabilityDetail,
  HealthConfidence,
  HealthProvider,
  HealthWorkout,
} from '@/services/health/types';

const PLAY_STORE =
  'market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding';
const PLAY_WEB = 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';

const SDK_UNAVAILABLE = 1;
const SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2;
const SDK_AVAILABLE = 3;
const RECORDING_METHOD_MANUAL_ENTRY = 3;
const DEVICE_PHONE = 2;
const DEVICE_FITNESS_BAND = 6;

type Permission = { accessType: 'read' | 'write'; recordType: string };

type NativeConnect = {
  SdkAvailabilityStatus?: {
    SDK_UNAVAILABLE?: number;
    SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED?: number;
    SDK_AVAILABLE?: number;
  };
  initialize: (providerPackageName?: string) => Promise<boolean>;
  getSdkStatus: (providerPackageName?: string) => Promise<number>;
  requestPermission: (permissions: Permission[]) => Promise<Permission[]>;
  getGrantedPermissions: () => Promise<Permission[]>;
  readRecords: (
    recordType: string,
    options: {
      timeRangeFilter: { operator: 'between'; startTime: string; endTime: string };
    },
  ) => Promise<{ records?: unknown[] } | unknown[]>;
};

type SessionRecord = {
  startTime?: string;
  endTime?: string;
  exerciseType?: number;
  title?: string;
  metadata?: {
    id?: string;
    dataOrigin?: string | { packageName?: string };
    recordingMethod?: number;
    device?: { type?: number; manufacturer?: string; model?: string };
  };
};

type IntervalRecord = {
  startTime?: string;
  endTime?: string;
  energy?: { inKilocalories?: number; value?: number; unit?: string };
  distance?: { inMeters?: number; value?: number; unit?: string };
  samples?: Array<{ time?: string; beatsPerMinute?: number; value?: number }>;
};

const READ_PERMS: Permission[] = [
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'Distance' },
];

const RUNNING = new Set([56, 57]);
const WALKING = new Set([37, 79]);
const CYCLING = new Set([8, 9]);
const STRENGTH = new Set([
  1, 3, 6, 7, 10, 12, 13, 15, 17, 18, 19, 20, 21, 22, 23, 24, 36, 40, 42, 43, 49, 67, 70, 81,
]);

const TYPE_LABEL: Record<number, string> = {
  0: 'Workout',
  8: 'Cycling',
  9: 'Indoor cycling',
  36: 'HIIT',
  37: 'Hiking',
  56: 'Running',
  57: 'Treadmill',
  70: 'Strength',
  79: 'Walking',
  81: 'Weightlifting',
};

function loadConnect(): NativeConnect | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  try {
    // UI must never import this module. Dynamic require keeps iOS/web compiling.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-health-connect') as NativeConnect;
  } catch {
    return null;
  }
}

function originOf(metadata?: SessionRecord['metadata']): string {
  const raw = metadata?.dataOrigin;
  if (typeof raw === 'string') {
    return raw;
  }
  return raw?.packageName ?? '';
}

function mapActivity(type: number, label: string): HealthActivityType {
  if (RUNNING.has(type) || /run/.test(label)) {
    return 'running';
  }
  if (WALKING.has(type) || /walk|hik/.test(label)) {
    return 'walking';
  }
  if (CYCLING.has(type) || /cycl|bike/.test(label)) {
    return 'cycling';
  }
  if (STRENGTH.has(type) || /strength|weight|hiit|core|functional/.test(label)) {
    return 'strength';
  }
  return 'other';
}

function mapConfidence(session: SessionRecord): HealthConfidence {
  const origin = originOf(session.metadata).toLowerCase();
  const method = session.metadata?.recordingMethod;
  const deviceType = session.metadata?.device?.type;
  const wearable =
    origin.includes('samsung') ||
    origin.includes('garmin') ||
    origin.includes('fitbit') ||
    origin.includes('polar') ||
    origin.includes('google.wear') ||
    origin.includes('wearable') ||
    deviceType === DEVICE_FITNESS_BAND;
  if (wearable) {
    return 'watch';
  }
  if (method === RECORDING_METHOD_MANUAL_ENTRY) {
    return 'manual';
  }
  if (deviceType === DEVICE_PHONE || origin.includes('android')) {
    return 'phone';
  }
  return 'unknown';
}

function kcalOf(energy?: IntervalRecord['energy']): number | undefined {
  if (!energy) {
    return undefined;
  }
  if (Number.isFinite(energy.inKilocalories) && (energy.inKilocalories ?? 0) > 0) {
    return energy.inKilocalories;
  }
  const value = Number(energy.value);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  if (energy.unit === 'calories') {
    return value / 1000;
  }
  if (energy.unit === 'joules') {
    return value / 4184;
  }
  if (energy.unit === 'kilojoules') {
    return value / 4.184;
  }
  return value;
}

function metersOf(distance?: IntervalRecord['distance']): number | undefined {
  if (!distance) {
    return undefined;
  }
  if (Number.isFinite(distance.inMeters) && (distance.inMeters ?? 0) > 0) {
    return distance.inMeters;
  }
  const value = Number(distance.value);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  if (distance.unit === 'kilometers') {
    return value * 1000;
  }
  if (distance.unit === 'miles') {
    return value * 1609.34;
  }
  if (distance.unit === 'feet') {
    return value * 0.3048;
  }
  if (distance.unit === 'inches') {
    return value * 0.0254;
  }
  return value;
}

function asRecords<T>(result: { records?: unknown[] } | unknown[]): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }
  return Array.isArray(result?.records) ? (result.records as T[]) : [];
}

function overlaps(
  start: string | undefined,
  end: string | undefined,
  from: number,
  to: number,
): boolean {
  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs = end ? new Date(end).getTime() : NaN;
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return false;
  }
  return startMs < to && endMs > from;
}

function hasRecord(granted: Permission[], recordType: string): boolean {
  return granted.some((row) => row.accessType === 'read' && row.recordType === recordType);
}

async function openInstall(): Promise<void> {
  try {
    const can = await Linking.canOpenURL(PLAY_STORE);
    await Linking.openURL(can ? PLAY_STORE : PLAY_WEB);
  } catch {
    try {
      await Linking.openURL(PLAY_WEB);
    } catch {
      // Store is optional. Settings still explains install.
    }
  }
}

class HealthConnectProvider implements HealthProvider {
  private detail: HealthAvailabilityDetail | null = null;
  private ready = false;

  isAvailable(): boolean {
    if (Platform.OS !== 'android') {
      return false;
    }
    if (this.detail === 'unavailable') {
      return false;
    }
    return loadConnect() != null;
  }

  async getAvailabilityDetail(): Promise<HealthAvailabilityDetail> {
    if (Platform.OS !== 'android') {
      this.detail = 'unavailable';
      return 'unavailable';
    }
    const hc = loadConnect();
    if (!hc) {
      this.detail = 'unavailable';
      return 'unavailable';
    }
    try {
      const status = await hc.getSdkStatus();
      if (status === (hc.SdkAvailabilityStatus?.SDK_AVAILABLE ?? SDK_AVAILABLE)) {
        this.detail = 'ready';
        return 'ready';
      }
      if (
        status ===
        (hc.SdkAvailabilityStatus?.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ??
          SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED)
      ) {
        this.detail = 'needs_install';
        return 'needs_install';
      }
      if (status === (hc.SdkAvailabilityStatus?.SDK_UNAVAILABLE ?? SDK_UNAVAILABLE)) {
        this.detail = 'unavailable';
        return 'unavailable';
      }
      this.detail = 'needs_install';
      return 'needs_install';
    } catch {
      this.detail = 'unavailable';
      return 'unavailable';
    }
  }

  private async ensureClient(): Promise<NativeConnect | null> {
    if (Platform.OS !== 'android') {
      return null;
    }
    const hc = loadConnect();
    if (!hc) {
      return null;
    }
    const detail = await this.getAvailabilityDetail();
    if (detail !== 'ready') {
      return null;
    }
    if (!this.ready) {
      try {
        this.ready = Boolean(await hc.initialize());
      } catch {
        this.ready = false;
      }
    }
    return this.ready ? hc : null;
  }

  async getAuthStatus(): Promise<HealthAuthStatus> {
    const local = await readLocalHealthStatus('health_connect');
    if (local === 'denied') {
      return 'denied';
    }
    const hc = await this.ensureClient();
    if (!hc) {
      return 'unknown';
    }
    try {
      const granted = await hc.getGrantedPermissions();
      if (hasRecord(granted, 'ExerciseSession')) {
        return 'connected';
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async requestAccess(): Promise<HealthAccessResult> {
    if (Platform.OS !== 'android') {
      return 'unavailable';
    }
    const hc = loadConnect();
    if (!hc) {
      return 'unavailable';
    }
    const detail = await this.getAvailabilityDetail();
    if (detail === 'unavailable') {
      return 'unavailable';
    }
    if (detail === 'needs_install' || detail === 'needs_update') {
      await openInstall();
      return 'unavailable';
    }
    try {
      this.ready = Boolean(await hc.initialize());
      if (!this.ready) {
        return 'unavailable';
      }
      const granted = await hc.requestPermission(READ_PERMS);
      if (hasRecord(granted, 'ExerciseSession')) {
        await writeLocalHealthStatus('connected', 'health_connect');
        return 'connected';
      }
      await writeLocalHealthStatus('denied', 'health_connect');
      return 'denied';
    } catch {
      await writeLocalHealthStatus('denied', 'health_connect');
      return 'denied';
    }
  }

  async disconnectLocal(): Promise<void> {
    await writeLocalHealthStatus('denied', 'health_connect');
  }

  async fetchWorkouts(params: { from: Date; to: Date }): Promise<HealthWorkout[]> {
    const hc = await this.ensureClient();
    if (!hc) {
      return [];
    }
    const disconnected = await readLocalHealthStatus('health_connect');
    if (disconnected === 'denied') {
      return [];
    }
    try {
      const granted = await hc.getGrantedPermissions();
      if (!hasRecord(granted, 'ExerciseSession')) {
        return [];
      }
      const window = {
        timeRangeFilter: {
          operator: 'between' as const,
          startTime: params.from.toISOString(),
          endTime: params.to.toISOString(),
        },
      };
      const sessions = asRecords<SessionRecord>(await hc.readRecords('ExerciseSession', window));
      const canCalories = hasRecord(granted, 'ActiveCaloriesBurned');
      const canDistance = hasRecord(granted, 'Distance');
      const canHr = hasRecord(granted, 'HeartRate');
      const [calories, distances, heartRates] = await Promise.all([
        canCalories
          ? asRecords<IntervalRecord>(await hc.readRecords('ActiveCaloriesBurned', window))
          : Promise.resolve([]),
        canDistance
          ? asRecords<IntervalRecord>(await hc.readRecords('Distance', window))
          : Promise.resolve([]),
        canHr
          ? asRecords<IntervalRecord>(await hc.readRecords('HeartRate', window))
          : Promise.resolve([]),
      ]);
      const mapped = sessions
        .map((session) =>
          mapSession(session, {
            calories,
            distances,
            heartRates,
            canHr,
          }),
        )
        .filter((row): row is HealthWorkout => Boolean(row));
      return mapped.sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1));
    } catch {
      return [];
    }
  }
}

function mapSession(
  session: SessionRecord,
  extras: {
    calories: IntervalRecord[];
    distances: IntervalRecord[];
    heartRates: IntervalRecord[];
    canHr: boolean;
  },
): HealthWorkout | null {
  const startedAt = new Date(session.startTime ?? '');
  const endedAt = new Date(session.endTime ?? '');
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime()) || endedAt <= startedAt) {
    return null;
  }
  const type = Number(session.exerciseType ?? 0);
  const label = String(session.title ?? '').trim() || TYPE_LABEL[type] || 'Workout';
  const from = startedAt.getTime();
  const to = endedAt.getTime();
  let caloriesKcal = 0;
  for (const row of extras.calories) {
    if (overlaps(row.startTime, row.endTime, from, to)) {
      caloriesKcal += kcalOf(row.energy) ?? 0;
    }
  }
  let distanceM = 0;
  for (const row of extras.distances) {
    if (overlaps(row.startTime, row.endTime, from, to)) {
      distanceM += metersOf(row.distance) ?? 0;
    }
  }
  let hrAvg: number | undefined;
  let hrMax: number | undefined;
  if (extras.canHr) {
    const values: number[] = [];
    for (const row of extras.heartRates) {
      if (!overlaps(row.startTime, row.endTime, from, to)) {
        continue;
      }
      for (const sample of row.samples ?? []) {
        const bpm = Number(sample.beatsPerMinute ?? sample.value);
        const at = sample.time ? new Date(sample.time).getTime() : NaN;
        if (!Number.isFinite(bpm) || bpm <= 0) {
          continue;
        }
        if (!Number.isNaN(at) && (at < from || at > to)) {
          continue;
        }
        values.push(bpm);
      }
    }
    if (values.length > 0) {
      hrAvg = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
      hrMax = Math.round(Math.max(...values));
    }
  }
  const providerWorkoutId =
    String(session.metadata?.id ?? '').trim() ||
    `${startedAt.toISOString()}-${endedAt.toISOString()}-${label}`;
  return {
    providerWorkoutId,
    source: 'health_connect',
    activityType: mapActivity(type, label.toLowerCase()),
    activityLabel: label,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationSec: Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)),
    caloriesKcal: caloriesKcal > 0 ? Math.round(caloriesKcal) : undefined,
    distanceM: distanceM > 0 ? Math.round(distanceM) : undefined,
    hrAvg,
    hrMax,
    sourceBundle: originOf(session.metadata) || undefined,
    confidence: mapConfidence(session),
  };
}

export const healthConnect: HealthProvider = new HealthConnectProvider();

// Keep a named helper so settings can deep-link without going through requestAccess twice.
export async function openHealthConnectInstall(): Promise<void> {
  await openInstall();
}
