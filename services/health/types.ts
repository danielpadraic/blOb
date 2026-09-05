export type HealthSource = 'apple_health' | 'health_connect';
export type HealthConfidence = 'watch' | 'phone' | 'manual' | 'unknown';
export type HealthAuthStatus = 'unknown' | 'connected' | 'denied';
export type HealthAccessResult = 'connected' | 'denied' | 'unavailable';
export type HealthAvailabilityDetail = 'unavailable' | 'needs_install' | 'needs_update' | 'ready';

export type HealthActivityType = 'running' | 'walking' | 'cycling' | 'strength' | 'other';

export type HealthWorkout = {
  providerWorkoutId: string;
  source: HealthSource;
  activityType: HealthActivityType;
  activityLabel: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  caloriesKcal?: number;
  distanceM?: number;
  hrAvg?: number;
  hrMax?: number;
  sourceBundle?: string;
  confidence: HealthConfidence;
};

export type HealthSyncResult = {
  workouts: HealthWorkout[];
  nextAnchor: string | null;
  deletedIds: string[];
};

/** One BPM reading. The series is what the workout proof card graphs. */
export type HealthHeartRateSample = { at: string; bpm: number };

export interface HealthProvider {
  isAvailable(): boolean;
  getAvailabilityDetail?(): Promise<HealthAvailabilityDetail>;
  getAuthStatus(): Promise<HealthAuthStatus>;
  requestAccess(): Promise<HealthAccessResult>;
  /** Workout write only. Used to start a challenge on Apple Watch. */
  requestWorkoutWrite?(): Promise<HealthAccessResult>;
  disconnectLocal(): Promise<void>;
  fetchWorkouts(params: { from: Date; to: Date }): Promise<HealthWorkout[]>;
  /** Incremental HealthKit sync. Optional — Android Health Connect ignores this. */
  syncNewWorkouts?(anchor?: string | null): Promise<HealthSyncResult>;
  enrichHeartRate?(workout: HealthWorkout): Promise<HealthWorkout>;
  /** Full BPM series inside a workout window. Empty array means the workout carried no HR. */
  fetchHeartRateSeries?(window: { startedAt: string; endedAt: string }): Promise<HealthHeartRateSample[]>;
  enableBackgroundSync?(): Promise<void>;
}
