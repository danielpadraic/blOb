import { Platform } from 'react-native';

import { appleHealth } from '@/services/health/apple';
import { healthConnect } from '@/services/health/healthConnect';
import type { HealthProvider, HealthSource } from '@/services/health/types';

export type {
  HealthAccessResult,
  HealthActivityType,
  HealthAuthStatus,
  HealthAvailabilityDetail,
  HealthConfidence,
  HealthProvider,
  HealthSource,
  HealthSyncResult,
  HealthWorkout,
} from '@/services/health/types';

export { appleHealth } from '@/services/health/apple';
export { healthConnect } from '@/services/health/healthConnect';

export function getHealthSource(): HealthSource | null {
  if (Platform.OS === 'ios') {
    return 'apple_health';
  }
  if (Platform.OS === 'android') {
    return 'health_connect';
  }
  return null;
}

export function getHealthProvider(): HealthProvider | null {
  if (Platform.OS === 'ios') {
    return appleHealth;
  }
  if (Platform.OS === 'android') {
    return healthConnect;
  }
  return null;
}

/** Render-safe. Missing HealthKit / a thrown native probe must not crash Check In. */
export function healthProviderAvailable(): boolean {
  try {
    return Boolean(getHealthProvider()?.isAvailable());
  } catch {
    return false;
  }
}
