import { describe, expect, it } from 'vitest';

import { MIN_BACKGROUND_MS, shouldReturnHomeOnResume } from '@/lib/appResume';

describe('shouldReturnHomeOnResume', () => {
  const base = {
    previous: 'background' as const,
    next: 'active' as const,
    backgroundedAt: 1_000,
    now: 1_000 + MIN_BACKGROUND_MS + 50,
    pathname: '/challenges',
  };

  it('returns Home only after a long true background', () => {
    expect(shouldReturnHomeOnResume(base)).toBe(true);
  });

  it('ignores inactive picker / permission / crop returns', () => {
    expect(
      shouldReturnHomeOnResume({
        ...base,
        previous: 'inactive',
        pathname: '/challenges/create',
      }),
    ).toBe(false);
  });

  it('ignores a short background flash from camera or gallery', () => {
    expect(
      shouldReturnHomeOnResume({
        ...base,
        now: 1_000 + 400,
        pathname: '/challenges/create',
      }),
    ).toBe(false);
  });

  it('never dumps create, submit, or capture', () => {
    expect(shouldReturnHomeOnResume({ ...base, pathname: '/challenges/create' })).toBe(false);
    expect(shouldReturnHomeOnResume({ ...base, pathname: '/challenges/abc/submit' })).toBe(false);
    expect(shouldReturnHomeOnResume({ ...base, pathname: '/challenges/abc/details' })).toBe(false);
    expect(shouldReturnHomeOnResume({ ...base, pathname: '/capture' })).toBe(false);
  });

  it('does not bounce Home onto itself', () => {
    expect(shouldReturnHomeOnResume({ ...base, pathname: '/feed' })).toBe(false);
  });

  it('never treats a web tab hide as leaving the app', () => {
    expect(shouldReturnHomeOnResume({ ...base, platform: 'web' })).toBe(false);
  });
});
