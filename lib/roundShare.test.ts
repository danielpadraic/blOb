import { describe, expect, it } from 'vitest';

import {
  allowedShareAudiences,
  canOfferShareToFeed,
  canShareRoundToFeed,
  clampShareAudience,
  clampShareAudienceUserIds,
  isRoundSharePost,
  reelIdFromShare,
  roundShareClipUnavailable,
  snapshotFromRound,
} from '@/lib/roundShare';

describe('Round share to Feed', () => {
  it('keeps Share to Feed off corporate Rounds', () => {
    expect(canShareRoundToFeed('public')).toBe(true);
    expect(canShareRoundToFeed('private')).toBe(true);
    expect(canShareRoundToFeed('private_corporate')).toBe(false);
    expect(
      canOfferShareToFeed({
        kind: 'round',
        postId: 'p1',
        challengeId: 'c1',
        privacyMode: null,
      }),
    ).toBe(false);
    expect(
      canOfferShareToFeed({
        kind: 'round',
        postId: 'p1',
        challengeId: 'c1',
        privacyMode: 'private_corporate',
      }),
    ).toBe(false);
    expect(canOfferShareToFeed({ kind: 'wave', postId: 'p1' })).toBe(false);
    expect(
      canOfferShareToFeed({
        kind: 'wave',
        postId: 'p1',
        challengeId: 'c1',
        privacyMode: 'private_corporate',
      }),
    ).toBe(false);
    expect(canOfferShareToFeed({ kind: 'round', postId: 'p1' })).toBe(true);
  });

  it('will not widen share audience past the Round', () => {
    expect(allowedShareAudiences('public')).toEqual(['friends', 'public', 'specific']);
    expect(allowedShareAudiences('friends')).toEqual(['friends', 'specific']);
    expect(allowedShareAudiences('specific')).toEqual(['specific']);
    expect(clampShareAudience('friends', 'public')).toBe('friends');
    expect(clampShareAudienceUserIds('specific', ['a', 'b'], ['b', 'c'])).toEqual(['b']);
  });

  it('treats a missing or hidden Round as an unavailable clip on the card', () => {
    expect(roundShareClipUnavailable(null)).toBe(true);
    expect(roundShareClipUnavailable({ type: 'round', hidden_from_rail: true })).toBe(true);
    expect(roundShareClipUnavailable({ type: 'round', deleted_at: '2026-01-01' })).toBe(true);
    expect(roundShareClipUnavailable({ type: 'round' })).toBe(false);
    expect(isRoundSharePost({ type: 'round_share' })).toBe(true);
    expect(isRoundSharePost({ type: 'round' })).toBe(false);
  });

  it('stores the reel id on the share snapshot for the player tap', () => {
    const snap = snapshotFromRound({
      reelId: 'reel-1',
      authorId: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
      coverUrl: 'https://blob.mobi/r.jpg',
    });
    expect(reelIdFromShare({ quote_snapshot: snap })).toBe('reel-1');
  });
});
