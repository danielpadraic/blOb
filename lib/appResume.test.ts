import { describe, expect, it } from 'vitest';

import { shouldResetToHomeOnLaunch, shouldReturnHomeOnResume } from '@/lib/appResume';

const resume = {
  previous: 'background' as const,
  next: 'active' as const,
  backgroundedAt: 1_000,
  now: 1_000 + 8_000,
  pathname: '/challenges',
};

describe('shouldReturnHomeOnResume', () => {
  it('never sends Home just because the app was backgrounded', () => {
    expect(shouldReturnHomeOnResume(resume)).toBe(false);
    expect(shouldReturnHomeOnResume({ ...resume, pathname: '/profile/lifts' })).toBe(false);
    expect(
      shouldReturnHomeOnResume({
        ...resume,
        pathname: '/lift/9f1c2e0a-0000-4000-8000-000000000000',
      }),
    ).toBe(false);
    expect(shouldReturnHomeOnResume({ ...resume, pathname: '/lift' })).toBe(false);
    expect(
      shouldReturnHomeOnResume({
        ...resume,
        pathname: '/challenges/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      }),
    ).toBe(false);
    expect(shouldReturnHomeOnResume({ ...resume, pathname: '/messages' })).toBe(false);
    expect(shouldReturnHomeOnResume({ ...resume, pathname: '/challenges/create' })).toBe(false);
    expect(shouldReturnHomeOnResume({ ...resume, platform: 'web' })).toBe(false);
  });

  it('ignores inactive picker flashes the same way — still not a Home reset', () => {
    expect(
      shouldReturnHomeOnResume({
        ...resume,
        previous: 'inactive',
        pathname: '/challenges/create',
      }),
    ).toBe(false);
  });
});

describe('shouldResetToHomeOnLaunch', () => {
  it('opens Home after a force-quit on a lift, not back into the session', () => {
    expect(
      shouldResetToHomeOnLaunch({ pathname: '/lift/9f1c2e0a-0000-4000-8000-000000000000' }),
    ).toBe(true);
    expect(shouldResetToHomeOnLaunch({ pathname: '/profile/lifts' })).toBe(true);
  });

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

  it('keeps in-progress capture, create, and auth through a cold start', () => {
    expect(shouldResetToHomeOnLaunch({ pathname: '/challenges/create' })).toBe(false);
    expect(shouldResetToHomeOnLaunch({ pathname: '/capture' })).toBe(false);
    expect(shouldResetToHomeOnLaunch({ pathname: '/checkin' })).toBe(false);
    expect(shouldResetToHomeOnLaunch({ pathname: '/auth/callback' })).toBe(false);
  });
});
