import { Platform } from 'react-native';

import { parseUspsRegion, type UspsRegion } from '@/lib/geo/regions';

type PermissionStatus = { status: string; canAskAgain?: boolean };
type PositionFn = (opts: { accuracy: number }) => Promise<{
  coords: { latitude: number; longitude: number };
}>;
type ReverseFn = (coords: { latitude: number; longitude: number }) => Promise<
  Array<{
    isoCountryCode?: string | null;
    region?: string | null;
    country?: string | null;
  }>
>;

async function locationModule(): Promise<{
  requestForegroundPermissionsAsync: () => Promise<PermissionStatus>;
  getForegroundPermissionsAsync: () => Promise<PermissionStatus>;
  getCurrentPositionAsync: PositionFn;
  reverseGeocodeAsync: ReverseFn;
  Accuracy: { Balanced: number };
}> {
  return import('expo-location');
}

export type PreciseFixResult =
  | { ok: true; region: UspsRegion }
  | { ok: false; reason: 'denied' | 'unavailable' | 'outside_us' };

function isUsTerritory(isoCountryCode?: string | null, country?: string | null): boolean {
  const iso = String(isoCountryCode ?? '')
    .trim()
    .toUpperCase();
  const name = String(country ?? '')
    .trim()
    .toUpperCase();
  return (
    iso === 'US' ||
    iso === 'USA' ||
    iso === 'PR' ||
    name === 'UNITED STATES' ||
    name === 'UNITED STATES OF AMERICA' ||
    name === 'PUERTO RICO'
  );
}

export function regionFromGeocode(input: {
  isoCountryCode?: string | null;
  region?: string | null;
  country?: string | null;
}): UspsRegion | 'outside_us' | null {
  const iso = String(input.isoCountryCode ?? '')
    .trim()
    .toUpperCase();
  if (iso === 'PR' || parseUspsRegion(input.region) === 'PR') {
    return 'PR';
  }
  if (!isUsTerritory(input.isoCountryCode, input.country)) {
    if (iso || String(input.country ?? '').trim()) {
      return 'outside_us';
    }
    return parseUspsRegion(input.region);
  }
  return parseUspsRegion(input.region) ?? (iso === 'PR' ? 'PR' : null);
}

/** While Using / web geolocation once. Never Always. GPS denied is not retried. */
export async function readPreciseUspsRegion(): Promise<PreciseFixResult> {
  let Location: Awaited<ReturnType<typeof locationModule>>;
  try {
    Location = await locationModule();
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  let permission: PermissionStatus;
  try {
    permission = await Location.getForegroundPermissionsAsync();
  } catch {
    return { ok: false, reason: 'denied' };
  }
  if (permission.status !== 'granted') {
    if (permission.canAskAgain === false) {
      return { ok: false, reason: 'denied' };
    }
    try {
      permission = await Location.requestForegroundPermissionsAsync();
    } catch {
      return { ok: false, reason: 'denied' };
    }
    if (permission.status !== 'granted') {
      return { ok: false, reason: 'denied' };
    }
  }

  let coords: { latitude: number; longitude: number };
  try {
    const reading = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    coords = reading.coords;
  } catch {
    return { ok: false, reason: Platform.OS === 'web' ? 'unavailable' : 'denied' };
  }

  let places: Awaited<ReturnType<ReverseFn>>;
  try {
    places = await Location.reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  const mapped = places
    .map((place) => regionFromGeocode(place))
    .find((code) => code != null);
  if (mapped === 'outside_us') {
    return { ok: false, reason: 'outside_us' };
  }
  if (mapped) {
    return { ok: true, region: mapped };
  }
  return { ok: false, reason: 'unavailable' };
}
