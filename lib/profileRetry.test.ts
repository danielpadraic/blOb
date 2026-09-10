import { describe, expect, it } from 'vitest';

import { errorBoundaryRetryHref, errorRetryHref, messagesRetryHref, profileRetryHref } from '@/lib/routes';

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
    expect(errorBoundaryRetryHref('/challenges/u/blob')).toBe('/challenges/u/blob');
    expect(errorRetryHref('/challenges/u/blob')).toBe('/challenges/u/blob');
    expect(errorBoundaryRetryHref('/capture')).toBe('/feed');
    expect(errorBoundaryRetryHref('/challenges/u/blob')).not.toBe('/challenges/u?tab=feed');
  });
});

describe('messagesRetryHref', () => {
  it('remounts that DM and never opens capture', () => {
    expect(messagesRetryHref('/messages/2ca49850-b978-45d8-a282-2b644913c538')).toBe(
      '/messages/2ca49850-b978-45d8-a282-2b644913c538',
    );
    expect(errorBoundaryRetryHref('/messages/2ca49850-b978-45d8-a282-2b644913c538')).toBe(
      '/messages/2ca49850-b978-45d8-a282-2b644913c538',
    );
    expect(messagesRetryHref('/messages')).toBe('/messages');
    expect(messagesRetryHref('/capture')).toBe('');
    expect(errorBoundaryRetryHref('/messages/2ca49850-b978-45d8-a282-2b644913c538')).not.toContain(
      '/capture',
    );
  });
});
