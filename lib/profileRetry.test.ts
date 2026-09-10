import { describe, expect, it } from 'vitest';

import { errorBoundaryRetryHref, profileRetryHref } from '@/lib/routes';

describe('profileRetryHref', () => {
  it('stays on this public profile and never opens Wave or capture', () => {
    expect(profileRetryHref('/feed/u/courtney')).toBe('/feed/u/courtney');
    expect(profileRetryHref('/feed/u/courtney?posted=abc')).toBe('/feed/u/courtney');
    expect(profileRetryHref('/friends/u/ada')).toBe('/friends/u/ada');
    expect(profileRetryHref('/challenges/u/blob')).toBe('/challenges/u/blob');
    expect(profileRetryHref('/profile/u/me')).toBe('/profile/u/me');
    expect(profileRetryHref('/capture')).toBe('');
    expect(profileRetryHref('/capture?mode=story')).toBe('');
    expect(profileRetryHref('/feed')).toBe('');
    expect(profileRetryHref('/u/courtney')).toBe('');
  });

  it('keeps AppErrorBoundary Retry on the same profile route', () => {
    expect(errorBoundaryRetryHref('/feed/u/courtney')).toBe('/feed/u/courtney');
    expect(errorBoundaryRetryHref('/friends/u/ada')).toBe('/friends/u/ada');
    expect(errorBoundaryRetryHref('/capture')).toBe('/feed');
  });
});
