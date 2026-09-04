import { describe, expect, it } from 'vitest';

import {
  clampLocationRadius,
  locationAccuracyOk,
  locationPartSatisfies,
  locationTooFarCopy,
  pointInLocationFence,
  publicLocationPlace,
} from '@/lib/locationProof';

describe('location proof', () => {
  it('clamps radius and hides coordinates on the public place', () => {
    expect(clampLocationRadius(10)).toBe(30);
    expect(clampLocationRadius(5000)).toBe(1000);
    expect(publicLocationPlace({ label: 'Gym', lat: 40.1, lng: -74.2, radius_m: 100 })).toEqual({
      place_id: null,
      label: 'Gym',
      radius_m: 100,
    });
  });

  it('accepts a GPS point inside the radius and rejects a far one', () => {
    const gym = { lat: 40.7484, lng: -73.9857, radius_m: 100 };
    expect(
      pointInLocationFence({ lat: 40.7485, lng: -73.9857, accuracy_m: 12 }, gym),
    ).toBe(true);
    expect(
      pointInLocationFence({ lat: 40.76, lng: -73.9857, accuracy_m: 12 }, gym),
    ).toBe(false);
  });

  it('rejects low-accuracy fixes even on top of the pin', () => {
    expect(locationAccuracyOk(200, 100)).toBe(false);
    expect(
      pointInLocationFence(
        { lat: 40.7484, lng: -73.9857, accuracy_m: 200 },
        { lat: 40.7484, lng: -73.9857, radius_m: 100 },
      ),
    ).toBe(false);
  });

  it('uses the fence copy', () => {
    expect(locationTooFarCopy('Home')).toBe('You don’t look close enough to Home. Move closer and try again.');
    expect(locationPartSatisfies({ in_fence: true })).toBe(true);
    expect(locationPartSatisfies({ in_fence: false })).toBe(false);
  });
});
