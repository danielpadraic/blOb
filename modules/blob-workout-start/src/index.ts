import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type WatchStartAvailability = {
  available: boolean;
  simulator: boolean;
  watchPaired: boolean;
  workoutKit: boolean;
};

export type WatchStartNative = {
  getAvailability: () => Promise<WatchStartAvailability>;
  startWatchApp: (activityType: string, locationType: string) => Promise<void>;
  previewWorkoutPlan: (
    activityType: string,
    locationType: string,
    displayName: string,
    goalSeconds: number | null,
  ) => Promise<void>;
};

export function loadWatchStartNative(): WatchStartNative | null {
  if (Platform.OS !== 'ios') {
    return null;
  }
  try {
    return requireOptionalNativeModule<WatchStartNative>('BlobWorkoutStart');
  } catch {
    return null;
  }
}
