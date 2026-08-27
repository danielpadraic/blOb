export const LOCATION_RADIUS_DEFAULT_M = 100;
export const LOCATION_RADIUS_MIN_M = 30;
export const LOCATION_RADIUS_MAX_M = 1000;
/** IP / city-level fixes are not a check-in. Typical GPS is well under this. */
export const LOCATION_MAX_ACCURACY_M = 80;

export type LocationPlace = {
  place_id?: string | null;
  label: string;
  lat?: number | null;
  lng?: number | null;
  radius_m: number;
};

export type LocationFix = {
  lat: number;
  lng: number;
  accuracy_m: number | null;
};

export type LocationProofPart = {
  method: 'location';
  place_id?: string | null;
  label?: string | null;
  radius_m?: number | null;
  in_fence?: boolean;
  accuracy_m?: number | null;
  submitted_at?: string | null;
};

export function clampLocationRadius(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return LOCATION_RADIUS_DEFAULT_M;
  }
  return Math.min(LOCATION_RADIUS_MAX_M, Math.max(LOCATION_RADIUS_MIN_M, n));
}

export function asFiniteCoord(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function placeLabel(place?: Pick<LocationPlace, 'label'> | null, fallback = 'the pinned place'): string {
  const label = place?.label?.trim();
  return label || fallback;
}

export function locationProofSentence(place?: Pick<LocationPlace, 'label'> | null): string {
  const label = place?.label?.trim();
  return label ? `Check in at ${label}.` : 'Check in at the pinned place.';
}

export function locationStartCaption(name: string, place: string): string {
  return `${name.trim() || 'Someone'} is at ${placeLabel({ label: place })}!`;
}

export function locationCompleteCaption(name: string, challengeTitle: string): string {
  const title = challengeTitle.trim() || 'the challenge';
  return `${name.trim() || 'Someone'} checked in for ${title}.`;
}

export function locationTooFarCopy(place?: string | null): string {
  return `You don’t look close enough to ${placeLabel({ label: place ?? '' })}. Move closer and try again.`;
}

export function locationNeedPhoneCopy(place?: string | null): string {
  return `Open the blOb app on your phone to check in at ${placeLabel({ label: place ?? '' })}.`;
}

export const LOCATION_PERMISSION_HINT = 'Turn on Location in Settings.';

export function parseLocationPlace(value: unknown): LocationPlace | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Record<string, unknown>;
  const nested = row.place && typeof row.place === 'object' ? (row.place as Record<string, unknown>) : row;
  const lat = asFiniteCoord(nested.lat ?? nested.latitude);
  const lng = asFiniteCoord(nested.lng ?? nested.longitude);
  const label = typeof nested.label === 'string' ? nested.label.trim() : '';
  const place_id =
    typeof nested.place_id === 'string'
      ? nested.place_id
      : typeof nested.placeId === 'string'
        ? nested.placeId
        : null;
  const radius_m = clampLocationRadius(nested.radius_m ?? nested.radiusM ?? LOCATION_RADIUS_DEFAULT_M);
  if (!label && lat == null && lng == null && !place_id) {
    return null;
  }
  return { place_id, label, lat, lng, radius_m };
}

export function publicLocationPlace(place?: LocationPlace | null): LocationPlace | null {
  if (!place) {
    return null;
  }
  return {
    place_id: place.place_id ?? null,
    label: placeLabel(place, ''),
    radius_m: clampLocationRadius(place.radius_m),
  };
}

export function hostLocationPlace(place?: LocationPlace | null): LocationPlace | null {
  const pub = publicLocationPlace(place);
  if (!pub) {
    return null;
  }
  return {
    ...pub,
    lat: asFiniteCoord(place?.lat),
    lng: asFiniteCoord(place?.lng),
  };
}

export function locationPlaceIsSet(place?: LocationPlace | null): boolean {
  return asFiniteCoord(place?.lat) != null && asFiniteCoord(place?.lng) != null;
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const earth = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function locationAccuracyOk(accuracyM: number | null | undefined, radiusM: number): boolean {
  if (accuracyM == null || !Number.isFinite(accuracyM) || accuracyM <= 0) {
    return false;
  }
  if (accuracyM > LOCATION_MAX_ACCURACY_M) {
    return false;
  }
  return accuracyM <= clampLocationRadius(radiusM);
}

export function pointInLocationFence(
  fix: LocationFix,
  place: Pick<LocationPlace, 'lat' | 'lng' | 'radius_m'>,
): boolean {
  const lat = asFiniteCoord(place.lat);
  const lng = asFiniteCoord(place.lng);
  if (lat == null || lng == null) {
    return false;
  }
  if (!locationAccuracyOk(fix.accuracy_m, place.radius_m)) {
    return false;
  }
  return haversineMeters({ lat: fix.lat, lng: fix.lng }, { lat, lng }) <= clampLocationRadius(place.radius_m);
}

export function locationPartSatisfies(part?: { in_fence?: boolean | null } | null): boolean {
  return part?.in_fence === true;
}
