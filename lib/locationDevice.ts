import { Platform } from 'react-native';

import {
  LOCATION_PERMISSION_HINT,
  locationAccuracyOk,
  locationNeedPhoneCopy,
  type LocationFix,
} from '@/lib/locationProof';

type PermissionFn = () => Promise<{ status: string }>;
type PositionFn = (opts: { accuracy: number }) => Promise<{
  coords: { latitude: number; longitude: number; accuracy: number | null };
}>;

async function locationModule(): Promise<{
  requestForegroundPermissionsAsync: PermissionFn;
  getForegroundPermissionsAsync: PermissionFn;
  getCurrentPositionAsync: PositionFn;
  Accuracy: { High: number };
}> {
  return import('expo-location');
}

export async function locationPermissionGrantedThisSession(): Promise<boolean> {
  try {
    const Location = await locationModule();
    const current = await Location.getForegroundPermissionsAsync();
    return current.status === 'granted';
  } catch {
    return false;
  }
}

export async function readLocationFix(radiusM: number): Promise<LocationFix> {
  let Location: Awaited<ReturnType<typeof locationModule>>;
  try {
    Location = await locationModule();
  } catch {
    throw new Error(locationNeedPhoneCopy());
  }
  let permission: { status: string };
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    throw new Error(LOCATION_PERMISSION_HINT);
  }
  if (permission.status !== 'granted') {
    throw new Error(LOCATION_PERMISSION_HINT);
  }
  let coords: { latitude: number; longitude: number; accuracy: number | null };
  try {
    const reading = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    coords = reading.coords;
  } catch {
    if (Platform.OS === 'web') {
      throw new Error(locationNeedPhoneCopy());
    }
    throw new Error(LOCATION_PERMISSION_HINT);
  }
  const fix: LocationFix = {
    lat: coords.latitude,
    lng: coords.longitude,
    accuracy_m: coords.accuracy,
  };
  if (!locationAccuracyOk(fix.accuracy_m, radiusM)) {
    if (Platform.OS === 'web') {
      throw new Error(locationNeedPhoneCopy());
    }
    throw new Error(LOCATION_PERMISSION_HINT);
  }
  return fix;
}
