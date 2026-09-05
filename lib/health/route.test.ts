import { describe, expect, it } from 'vitest';

import {
  buildWorkoutRoute,
  downsampleRoute,
  parseWorkoutRoute,
  projectRoute,
  routeActivityFor,
  routeLengthMeters,
  ROUTE_MAX_POINTS,
  type RoutePoint,
} from '@/lib/health/route';

/** A loop around Eagle, ID, shaped so the projection has something to preserve. */
function loopSamples(count = 40): Array<{ latitude: number; longitude: number; timestamp: string }> {
  const rows: Array<{ latitude: number; longitude: number; timestamp: string }> = [];
  const start = Date.parse('2026-09-04T13:33:00.000Z');
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    rows.push({
      latitude: 43.6955 + Math.sin(angle) * 0.01,
      longitude: -116.3539 + Math.cos(angle) * 0.014,
      timestamp: new Date(start + index * 30_000).toISOString(),
    });
  }
  return rows;
}

describe('building a route from location samples', () => {
  it('keeps the shape, bounds and endpoints', () => {
    const route = buildWorkoutRoute({ locations: loopSamples(), activityType: 'running' });
    expect(route?.kind).toBe('gps');
    expect(route?.activity).toBe('run');
    expect(route?.pointCount).toBe(40);
    expect(route?.polyline.length).toBe(40);
    expect(route?.bounds.maxLat).toBeGreaterThan(route!.bounds.minLat);
    expect(route?.start).toEqual({ lat: route!.polyline[0].lat, lng: route!.polyline[0].lng });
    expect(route?.end).toEqual({
      lat: route!.polyline[route!.polyline.length - 1].lat,
      lng: route!.polyline[route!.polyline.length - 1].lng,
    });
  });

  it('carries timestamps through when the samples had them', () => {
    const route = buildWorkoutRoute({ locations: loopSamples(), activityType: 'running' });
    expect(route?.polyline[0].t).toBe('2026-09-04T13:33:00.000Z');
  });

  it('returns null for an indoor workout with no samples', () => {
    expect(buildWorkoutRoute({ locations: [], activityType: 'strength' })).toBeNull();
  });

  it('returns null rather than drawing a two-point straight line', () => {
    const locations = [
      { latitude: 43.69, longitude: -116.35 },
      { latitude: 43.7, longitude: -116.36 },
    ];
    expect(buildWorkoutRoute({ locations, activityType: 'running' })).toBeNull();
  });

  it('returns null for a stationary track, so a treadmill with GPS on shows no map', () => {
    const locations = Array.from({ length: 30 }, () => ({ latitude: 43.6955, longitude: -116.3539 }));
    expect(buildWorkoutRoute({ locations, activityType: 'running' })).toBeNull();
  });

  it('drops Null Island and out-of-range fixes', () => {
    const locations = [
      ...loopSamples(20),
      { latitude: 0, longitude: 0, timestamp: '2026-09-04T14:00:00.000Z' },
      { latitude: 999, longitude: -116.35, timestamp: '2026-09-04T14:01:00.000Z' },
      { latitude: null as unknown as number, longitude: -116.35, timestamp: '' },
    ];
    const route = buildWorkoutRoute({ locations, activityType: 'walking' });
    expect(route?.pointCount).toBe(20);
    for (const point of route!.polyline) {
      expect(Math.abs(point.lat)).toBeGreaterThan(1);
    }
  });

  it('caps a long track and keeps the true first and last fix', () => {
    const locations = loopSamples(2000);
    const route = buildWorkoutRoute({ locations, activityType: 'cycling' });
    expect(route?.pointCount).toBe(2000);
    expect(route?.polyline.length).toBe(ROUTE_MAX_POINTS);
    expect(route?.polyline[0].lat).toBeCloseTo(locations[0].latitude, 4);
    expect(route?.polyline[ROUTE_MAX_POINTS - 1].lat).toBeCloseTo(locations[1999].latitude, 4);
  });

  it('maps activities onto accents', () => {
    expect(routeActivityFor('running')).toBe('run');
    expect(routeActivityFor('Outdoor Walk')).toBe('walk');
    expect(routeActivityFor('Hiking')).toBe('hike');
    expect(routeActivityFor('cycling')).toBe('ride');
    expect(routeActivityFor('strength')).toBe('other');
    expect(routeActivityFor(null)).toBe('other');
  });
});

describe('downsampling', () => {
  it('leaves a short track alone', () => {
    const points: RoutePoint[] = [
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
    ];
    expect(downsampleRoute(points, 200)).toEqual(points);
  });

  it('always keeps both ends', () => {
    const points: RoutePoint[] = Array.from({ length: 999 }, (_, index) => ({ lat: index, lng: index }));
    const kept = downsampleRoute(points, 50);
    expect(kept.length).toBe(50);
    expect(kept[0]).toEqual({ lat: 0, lng: 0 });
    expect(kept[49]).toEqual({ lat: 998, lng: 998 });
  });
});

describe('projecting into the card panel', () => {
  const route = buildWorkoutRoute({ locations: loopSamples(60), activityType: 'running' })!;

  it('fits inside the box with padding respected', () => {
    const projected = projectRoute(route, { width: 872, height: 520, padding: 24 });
    for (const point of projected.points) {
      expect(point.x).toBeGreaterThanOrEqual(23.9);
      expect(point.x).toBeLessThanOrEqual(848.1);
      expect(point.y).toBeGreaterThanOrEqual(23.9);
      expect(point.y).toBeLessThanOrEqual(496.1);
    }
  });

  it('emits an SVG path that starts with a move', () => {
    const projected = projectRoute(route, { width: 872, height: 520 });
    expect(projected.path.startsWith('M')).toBe(true);
    expect(projected.path).toContain('L');
    expect(projected.start).toEqual(projected.points[0]);
    expect(projected.end).toEqual(projected.points[projected.points.length - 1]);
  });

  it('keeps real proportions instead of stretching to fill', () => {
    // The loop is wider than it is tall, so the drawn line must be wider than tall too.
    const projected = projectRoute(route, { width: 800, height: 800, padding: 0 });
    const xs = projected.points.map((point) => point.x);
    const ys = projected.points.map((point) => point.y);
    const drawnW = Math.max(...xs) - Math.min(...xs);
    const drawnH = Math.max(...ys) - Math.min(...ys);
    expect(drawnW).toBeGreaterThan(drawnH);
  });

  it('puts north at the top', () => {
    const northmost = route.polyline.reduce((best, point) => (point.lat > best.lat ? point : best));
    const index = route.polyline.indexOf(northmost);
    const projected = projectRoute(route, { width: 400, height: 400 });
    const ys = projected.points.map((point) => point.y);
    expect(projected.points[index].y).toBeCloseTo(Math.min(...ys), 1);
  });
});

describe('round trip through storage', () => {
  it('parses back what it wrote', () => {
    const route = buildWorkoutRoute({ locations: loopSamples(30), activityType: 'cycling' })!;
    const parsed = parseWorkoutRoute(JSON.parse(JSON.stringify(route)));
    expect(parsed?.activity).toBe('ride');
    expect(parsed?.polyline.length).toBe(route.polyline.length);
    expect(parsed?.start).toEqual(route.start);
  });

  it('rejects anything that is not a stored gps track', () => {
    expect(parseWorkoutRoute(null)).toBeNull();
    expect(parseWorkoutRoute({})).toBeNull();
    expect(parseWorkoutRoute({ kind: 'gps', polyline: [] })).toBeNull();
    expect(parseWorkoutRoute({ kind: 'gps', polyline: [{ lat: 1, lng: 1 }] })).toBeNull();
    expect(parseWorkoutRoute({ kind: 'guess', polyline: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] })).toBeNull();
  });

  it('falls back to other for an unknown activity', () => {
    const parsed = parseWorkoutRoute({
      kind: 'gps',
      activity: 'teleport',
      polyline: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
    });
    expect(parsed?.activity).toBe('other');
  });
});

describe('route length', () => {
  it('measures a known loop in a plausible range', () => {
    const route = buildWorkoutRoute({ locations: loopSamples(200), activityType: 'running' })!;
    const metres = routeLengthMeters(route);
    // ~0.01 deg lat by 0.014 deg lng ellipse: a few kilometres around.
    expect(metres).toBeGreaterThan(3000);
    expect(metres).toBeLessThan(9000);
  });
});
