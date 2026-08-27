import { describe, expect, it } from 'vitest';

import { MIN_BACKGROUND_MS, shouldResetToHomeOnLaunch, shouldReturnHomeOnResume } from '@/lib/appResume';

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

  it('uses the same resume rules on Expo Web as native', () => {
    expect(shouldReturnHomeOnResume({ ...base, platform: 'web' })).toBe(true);
    expect(shouldReturnHomeOnResume({ ...base, platform: 'web', pathname: '/challenges/create' })).toBe(
      false,
    );
  });
});

describe('shouldResetToHomeOnLaunch', () => {
  it('opens Home after a force-quit on a challenge, not the last lobby', () => {
    expect(
      shouldResetToHomeOnLaunch({
        pathname: '/challenges/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        initialUrl: null,
        platform: 'ios',
      }),
    ).toBe(true);
  });

  it('keeps an explicit challenge link, share, or notification URL', () => {
    expect(
      shouldResetToHomeOnLaunch({
        pathname: '/challenges/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        initialUrl: 'https://blob.mobi/challenges/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        platform: 'ios',
      }),
    ).toBe(false);
    expect(
      shouldResetToHomeOnLaunch({
        pathname: '/challenges/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        initialUrl: 'blob://challenges/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        platform: 'android',
      }),
    ).toBe(false);
  });

  it('does not yank a web challenge URL the person opened', () => {
    expect(
      shouldResetToHomeOnLaunch({
        pathname: '/challenges/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        initialUrl: 'https://blob.mobi/challenges/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        platform: 'web',
      }),
    ).toBe(false);
    expect(
      shouldResetToHomeOnLaunch({
        pathname: '/challenges/week_10',
        initialUrl: 'https://blob.mobi/challenges/week_10',
        platform: 'web',
      }),
    ).toBe(false);
  });

  it('opens Home on web when the address bar is not a challenge link', () => {
    expect(
      shouldResetToHomeOnLaunch({
        pathname: '/challenges/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        initialUrl: 'https://blob.mobi/',
        platform: 'web',
      }),
    ).toBe(true);
    expect(
      shouldResetToHomeOnLaunch({
        pathname: '/challenges/week_10',
        initialUrl: 'https://blob.mobi/feed',
        platform: 'web',
      }),
    ).toBe(true);
  });
});
