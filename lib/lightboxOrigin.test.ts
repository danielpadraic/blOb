import { describe, expect, it } from 'vitest';

import {
  lightboxNeedsRestore,
  lightboxOriginFromPath,
  lightboxReturnHref,
} from '@/lib/lightboxOrigin';

const LIVE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const THIRTY = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1';

describe('lightboxOriginFromPath', () => {
  it('records Home from the feed path', () => {
    expect(lightboxOriginFromPath('/feed')).toEqual({ kind: 'home' });
    expect(lightboxOriginFromPath('/feed/')).toEqual({ kind: 'home' });
  });

  it('records Live when the tab is live or feed', () => {
    expect(lightboxOriginFromPath(`/challenges/${LIVE}`, 'live')).toEqual({
      kind: 'live',
      challengeId: LIVE,
    });
    expect(lightboxOriginFromPath(`/challenges/${LIVE}`, 'feed')).toEqual({
      kind: 'live',
      challengeId: LIVE,
    });
  });

  it('records Overview when that is the open tab', () => {
    expect(lightboxOriginFromPath(`/challenges/${LIVE}`, 'overview')).toEqual({
      kind: 'overview',
      challengeId: LIVE,
    });
  });
});

describe('lightboxReturnHref', () => {
  it('returns that Live thread, never Home or last-open 30-Day', () => {
    expect(lightboxReturnHref({ kind: 'live', challengeId: LIVE, postId: 'p1' })).toBe(
      `/challenges/${LIVE}?tab=live`,
    );
    expect(lightboxReturnHref({ kind: 'live', challengeId: LIVE })).not.toContain('postId');
    expect(lightboxReturnHref({ kind: 'live', challengeId: LIVE })).not.toContain(THIRTY);
    expect(lightboxReturnHref({ kind: 'home' })).toBe('/feed');
    expect(lightboxReturnHref({ kind: 'overview', challengeId: LIVE })).toBe(
      `/challenges/${LIVE}?tab=overview`,
    );
  });
});

describe('lightboxNeedsRestore', () => {
  it('stays put on the same Live thread so scroll is kept', () => {
    expect(
      lightboxNeedsRestore({ kind: 'live', challengeId: LIVE }, `/challenges/${LIVE}`, 'live'),
    ).toBe(false);
    expect(lightboxNeedsRestore({ kind: 'live', challengeId: LIVE }, `/challenges/${LIVE}`)).toBe(
      false,
    );
  });

  it('restores Live when X would otherwise dump Home, a profile, Lobby, submit, or 30-Day', () => {
    const origin = { kind: 'live' as const, challengeId: LIVE };
    expect(lightboxNeedsRestore(origin, '/feed')).toBe(true);
    expect(lightboxNeedsRestore(origin, '/u/ada')).toBe(true);
    expect(lightboxNeedsRestore(origin, '/challenges')).toBe(true);
    expect(lightboxNeedsRestore(origin, `/challenges/${LIVE}/submit`)).toBe(true);
    expect(lightboxNeedsRestore(origin, `/challenges/${THIRTY}`, 'live')).toBe(true);
    expect(lightboxNeedsRestore(origin, `/challenges/${LIVE}`, 'overview')).toBe(true);
  });

  it('returns Home only when the photo was opened from Home', () => {
    expect(lightboxNeedsRestore({ kind: 'home' }, '/feed')).toBe(false);
    expect(lightboxNeedsRestore({ kind: 'home' }, `/challenges/${LIVE}`, 'live')).toBe(true);
  });
});
