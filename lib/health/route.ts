/**
 * Workout route: simplification, bounds and the projection the proof card draws.
 *
 * Everything here is pure so the same line renders identically on iOS, Android and Web. Native
 * captures the track once at attach time; Web only ever redraws what was already stored.
 *
 * Nothing in this module invents coordinates. A workout with no usable samples yields null, and the
 * card then shows its indoor composition instead of an empty map.
 */

export type RoutePoint = { lat: number; lng: number; t?: string };

export type RouteActivity = 'run' | 'walk' | 'hike' | 'ride' | 'other';

export type WorkoutRoute = {
  kind: 'gps';
  activity: RouteActivity;
  pointCount: number;
  polyline: RoutePoint[];
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
};

/** Keeps the stored line small enough to sit in a jsonb column and still read as the same shape. */
export const ROUTE_MAX_POINTS = 200;

/** Below this a "route" is a dot, not a track, and drawing it would overstate what we know. */
const MIN_POINTS = 4;

/** Guards against a stray sample at (0,0) or a corrupt value dragging the whole map open. */
function isUsablePoint(value: unknown): value is { latitude: number; longitude: number; timestamp?: string } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const row = value as { latitude?: unknown; longitude?: unknown };
  // Checked before coercion: Number(null) is 0, which would silently place a missing latitude on
  // the equator instead of discarding the sample.
  if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number') {
    return false;
  }
  const lat = row.latitude;
  const lng = row.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return false;
  }
  // Exactly (0, 0) is a sensor failure, never a workout. A real zero on one axis alone is fine:
  // the equator and the prime meridian both run through inhabited ground.
  return Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001;
}

export function routeActivityFor(activityType?: string | null): RouteActivity {
  const name = String(activityType ?? '').toLowerCase();
  if (name.includes('run')) {
    return 'run';
  }
  if (name.includes('hik')) {
    return 'hike';
  }
  if (name.includes('walk')) {
    return 'walk';
  }
  if (name.includes('cycl') || name.includes('ride') || name.includes('bike')) {
    return 'ride';
  }
  return 'other';
}

/**
 * Evenly spaced downsample that always keeps the first and last fix.
 *
 * Perpendicular-distance simplification would hug the shape more tightly, but it can drop the
 * turnaround of an out-and-back, and on a 300px card panel the even sample is visually identical.
 */
export function downsampleRoute(points: RoutePoint[], max = ROUTE_MAX_POINTS): RoutePoint[] {
  if (points.length <= max) {
    return points.slice();
  }
  const kept: RoutePoint[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let index = 0; index < max; index += 1) {
    kept.push(points[Math.round(index * step)]);
  }
  // Rounding can land twice on the final index; the last fix must be the real end.
  kept[kept.length - 1] = points[points.length - 1];
  return kept;
}

export function routeBounds(points: RoutePoint[]): WorkoutRoute['bounds'] {
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }
  return { minLat, minLng, maxLat, maxLng };
}

/** Trims stored coordinates so the jsonb stays small. ~1 m of precision is plenty for a card. */
function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/**
 * Builds the stored route from raw location samples. Returns null when there is no honest track:
 * indoor workouts, denied location, or too few fixes.
 */
export function buildWorkoutRoute(input: {
  locations: unknown[];
  activityType?: string | null;
  maxPoints?: number;
}): WorkoutRoute | null {
  const rows = Array.isArray(input.locations) ? input.locations : [];
  const clean: RoutePoint[] = [];
  for (const row of rows) {
    if (!isUsablePoint(row)) {
      continue;
    }
    const point: RoutePoint = { lat: round5(row.latitude), lng: round5(row.longitude) };
    const timestamp = typeof row.timestamp === 'string' ? row.timestamp.trim() : '';
    if (timestamp) {
      point.t = timestamp;
    }
    clean.push(point);
  }
  if (clean.length < MIN_POINTS) {
    return null;
  }

  const bounds = routeBounds(clean);
  // A track that never moved is a stationary workout with GPS on, not a route worth drawing.
  if (bounds.maxLat - bounds.minLat < 0.0002 && bounds.maxLng - bounds.minLng < 0.0002) {
    return null;
  }

  const polyline = downsampleRoute(clean, input.maxPoints ?? ROUTE_MAX_POINTS);
  return {
    kind: 'gps',
    activity: routeActivityFor(input.activityType),
    pointCount: clean.length,
    polyline,
    bounds: routeBounds(polyline),
    start: { lat: polyline[0].lat, lng: polyline[0].lng },
    end: { lat: polyline[polyline.length - 1].lat, lng: polyline[polyline.length - 1].lng },
  };
}

export function parseWorkoutRoute(value: unknown): WorkoutRoute | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as { kind?: unknown; polyline?: unknown; activity?: unknown; pointCount?: unknown };
  if (row.kind !== 'gps' || !Array.isArray(row.polyline)) {
    return null;
  }
  const polyline: RoutePoint[] = [];
  for (const point of row.polyline) {
    const lat = Number((point as { lat?: unknown })?.lat);
    const lng = Number((point as { lng?: unknown })?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    const at = (point as { t?: unknown })?.t;
    polyline.push(typeof at === 'string' && at ? { lat, lng, t: at } : { lat, lng });
  }
  if (polyline.length < 2) {
    return null;
  }
  const activity = row.activity;
  return {
    kind: 'gps',
    activity:
      activity === 'run' || activity === 'walk' || activity === 'hike' || activity === 'ride'
        ? activity
        : 'other',
    pointCount: Number.isFinite(Number(row.pointCount)) ? Number(row.pointCount) : polyline.length,
    polyline,
    bounds: routeBounds(polyline),
    start: { lat: polyline[0].lat, lng: polyline[0].lng },
    end: { lat: polyline[polyline.length - 1].lat, lng: polyline[polyline.length - 1].lng },
  };
}

export type RouteBox = { width: number; height: number; padding?: number };
export type ProjectedRoute = {
  points: Array<{ x: number; y: number }>;
  path: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

/**
 * Projects the track into a drawing box.
 *
 * Longitude degrees shrink with latitude, so they are scaled by cos(lat) before fitting. Without
 * that a north-south loop renders visibly stretched. One scale is used for both axes so the shape
 * keeps its real proportions instead of being warped to fill the panel.
 */
export function projectRoute(route: WorkoutRoute, box: RouteBox): ProjectedRoute {
  const padding = box.padding ?? 24;
  const innerW = Math.max(box.width - padding * 2, 1);
  const innerH = Math.max(box.height - padding * 2, 1);

  const midLat = (route.bounds.minLat + route.bounds.maxLat) / 2;
  const lngScale = Math.max(Math.cos((midLat * Math.PI) / 180), 0.01);

  const spanX = Math.max((route.bounds.maxLng - route.bounds.minLng) * lngScale, 1e-6);
  const spanY = Math.max(route.bounds.maxLat - route.bounds.minLat, 1e-6);
  const scale = Math.min(innerW / spanX, innerH / spanY);

  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offsetX = padding + (innerW - drawnW) / 2;
  const offsetY = padding + (innerH - drawnH) / 2;

  const points = route.polyline.map((point) => ({
    x: offsetX + (point.lng - route.bounds.minLng) * lngScale * scale,
    // Screen y grows downward while latitude grows north, so this axis flips.
    y: offsetY + (route.bounds.maxLat - point.lat) * scale,
  }));

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');

  return { points, path, start: points[0], end: points[points.length - 1] };
}

/** Straight-line distance in metres, used only to sanity-check a track. */
export function haversineMeters(a: RoutePoint, b: RoutePoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of the stored line. Reported distance still wins on the card; this is a fallback. */
export function routeLengthMeters(route: WorkoutRoute): number {
  let total = 0;
  for (let index = 1; index < route.polyline.length; index += 1) {
    total += haversineMeters(route.polyline[index - 1], route.polyline[index]);
  }
  return Math.round(total);
}
