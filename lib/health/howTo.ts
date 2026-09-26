import { Platform } from 'react-native';

import { copy } from '@/lib/copy';

/** iOS / Safari path. Android keeps Health Connect wording and never prints this. */
export function healthHowToIosPath(): string {
  return copy('health.howToIos');
}

export function healthPermissionDeniedMessage(): string {
  return Platform.OS === 'android' ? copy('health.permissionDenied') : copy('health.permissionDeniedIos');
}

export function healthEmptyMessage(): string {
  return Platform.OS === 'android' ? copy('health.empty') : copy('health.emptyIos');
}

export function healthHowToLine(): string | null {
  return Platform.OS === 'android' ? null : healthHowToIosPath();
}
