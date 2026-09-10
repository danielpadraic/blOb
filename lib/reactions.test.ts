import { describe, expect, it } from 'vitest';

import {
  applyStackedReaction,
  cornerReactionChips,
  displayReactionType,
  isFreshOptimisticReactionKey,
  isWritableReactionType,
  LIKE_MARK_REV,
  LIVE_BUBBLE_PILL_INSET,
  LIVE_PILL_HEIGHT,
  LIVE_PILL_OVERLAP,
  liveReactionPill,
  markOptimisticReactionWrite,
  mergeReactionListsByKey,
  PICKER_REACTION_TYPES,
  reactionFlightKey,
  reactionMarkFile,
  reactionPickerLabel,
  reactionSetKey,
  resetOptimisticReactionWritesForTests,
  toggleStackedReactionList,
  userHasReactionType,
  userReactionTypes,
} from '@/lib/reactions';

describe('shared reactions', () => {
  it('maps existing care rows to LOL and writes laugh', () => {
    expect(displayReactionType('care')).toBe('laugh');
    expect(displayReactionType('laugh')).toBe('laugh');
    expect(reactionPickerLabel('laugh')).toBe('LOL');
    expect(isWritableReactionType('laugh')).toBe(true);
    expect(isWritableReactionType('rofl')).toBe(true);
  });

  it('maps each type to a Bob PNG and leftover strings still render', () => {
    expect(reactionMarkFile('like')).toBe('like.png');
    expect(reactionMarkFile('love')).toBe('love.png');
    expect(reactionMarkFile('laugh')).toBe('lol.png');
    expect(reactionMarkFile('lol')).toBe('lol.png');
    expect(reactionMarkFile('care')).toBe('lol.png');
    expect(reactionMarkFile('fire')).toBe('fire.png');
    expect(reactionMarkFile('sad')).toBe('sad.png');
    expect(reactionMarkFile('rofl')).toBe('rofl.png');
    expect(reactionMarkFile('shock')).toBe('like.png');
    expect(reactionMarkFile('applause')).toBe('like.png');
    expect(reactionMarkFile('unknown')).toBe('like.png');
  });

  it('includes ROFL in the picker after like / love / laugh', () => {
    expect(PICKER_REACTION_TYPES).toEqual(['like', 'love', 'laugh', 'rofl', 'fire', 'sad']);
  });

  it('stacks types for one user and toggles only that type off', () => {
    const afterLike = toggleStackedReactionList([], 'me', 'like', 'p', null);
    const afterLol = toggleStackedReactionList(afterLike, 'me', 'laugh', 'p', null);
    const afterFire = toggleStackedReactionList(afterLol, 'me', 'fire', 'p', null);
    expect(afterFire.map((row) => row.reaction_type)).toEqual(['like', 'laugh', 'fire']);
    const withoutLol = toggleStackedReactionList(afterFire, 'me', 'laugh', 'p', null);
    expect(withoutLol.map((row) => row.reaction_type)).toEqual(['like', 'fire']);
    expect(userHasReactionType(withoutLol, 'me', 'like')).toBe(true);
    expect(userHasReactionType(withoutLol, 'me', 'laugh')).toBe(false);
    expect(userReactionTypes(withoutLol, 'me')).toEqual(['like', 'fire']);
  });

  it('keys one user + type and toggles only that key', () => {
    expect(reactionSetKey({ postId: 'p', userId: 'me', type: 'like' })).toBe('p::me:like');
    expect(reactionFlightKey('p', null, 'laugh')).toBe('p::laugh');
    const added = applyStackedReaction([], 'add', 'me', 'like', 'p', null);
    const alsoLol = applyStackedReaction(added, 'add', 'me', 'laugh', 'p', null);
    expect(alsoLol.map((row) => row.reaction_type)).toEqual(['like', 'laugh']);
    const unlike = applyStackedReaction(alsoLol, 'remove', 'me', 'like', 'p', null);
    expect(unlike.map((row) => row.reaction_type)).toEqual(['laugh']);
  });

  it('does not replace other types when merging one incoming reaction', () => {
    const existing = [
      { id: '1', user_id: 'me', post_id: 'p', reaction_type: 'like' as const, created_at: '2026-09-01T12:00:00.000Z' },
      { id: '2', user_id: 'a', post_id: 'p', reaction_type: 'fire' as const, created_at: '2026-09-01T12:00:01.000Z' },
    ];
    const merged = mergeReactionListsByKey(existing, [
      { id: '3', user_id: 'b', post_id: 'p', reaction_type: 'laugh' as const, created_at: '2026-09-01T12:00:02.000Z' },
    ]);
    expect(merged.map((row) => row.reaction_type)).toEqual(['like', 'fire', 'laugh']);
  });

  it('ignores a realtime row that matches a fresh optimistic key', () => {
    resetOptimisticReactionWritesForTests();
    markOptimisticReactionWrite(reactionSetKey({ postId: 'p', userId: 'me', type: 'like' }));
    expect(isFreshOptimisticReactionKey(reactionSetKey({ postId: 'p', userId: 'me', type: 'like' }))).toBe(true);
    const existing = [
      { id: 'opt', user_id: 'me', post_id: 'p', reaction_type: 'like' as const, created_at: '2026-09-01T12:00:00.000Z' },
    ];
    const merged = mergeReactionListsByKey(existing, [
      { id: 'server', user_id: 'me', post_id: 'p', reaction_type: 'like' as const, created_at: '2026-09-01T12:00:00.000Z' },
    ]);
    expect(merged[0]?.id).toBe('opt');
    resetOptimisticReactionWritesForTests();
  });

  it('builds one WhatsApp pill with a combined reactor count', () => {
    const reactions = [
      { id: '1', user_id: 'me', post_id: 'p', reaction_type: 'like' as const, created_at: '2026-09-01T12:00:00.000Z' },
      { id: '2', user_id: 'me', post_id: 'p', reaction_type: 'fire' as const, created_at: '2026-09-01T12:00:01.000Z' },
      { id: '3', user_id: 'a', post_id: 'p', reaction_type: 'like' as const, created_at: '2026-09-01T12:00:02.000Z' },
    ];
    const pill = liveReactionPill(reactions, 'me');
    expect(pill.types.map((row) => row.type)).toEqual(['like', 'fire']);
    expect(pill.types.find((row) => row.type === 'like')?.mine).toBe(true);
    expect(pill.reactorCount).toBe(2);
    expect(LIVE_BUBBLE_PILL_INSET).toBe(14);
    expect(LIVE_PILL_OVERLAP).toBe(13);
    expect(LIVE_PILL_HEIGHT).toBe(26);
    expect(LIKE_MARK_REV).toBeGreaterThan(1);
  });

  it('shows up to six types in the corner stack', () => {
    const reactions = [
      { id: '1', user_id: 'me', post_id: 'p', reaction_type: 'love' as const, created_at: '2026-09-01T12:00:00.000Z' },
      { id: '2', user_id: 'a', post_id: 'p', reaction_type: 'like' as const, created_at: '2026-09-01T12:00:01.000Z' },
      { id: '3', user_id: 'b', post_id: 'p', reaction_type: 'laugh' as const, created_at: '2026-09-01T12:00:02.000Z' },
      { id: '4', user_id: 'c', post_id: 'p', reaction_type: 'fire' as const, created_at: '2026-09-01T12:00:03.000Z' },
      { id: '5', user_id: 'd', post_id: 'p', reaction_type: 'sad' as const, created_at: '2026-09-01T12:00:04.000Z' },
    ];
    const corner = cornerReactionChips(reactions, 'me');
    expect(corner.map((row) => row.type)).toEqual(['like', 'love', 'laugh', 'fire', 'sad']);
    expect(corner.find((row) => row.type === 'love')?.mine).toBe(true);
  });
});
