import { describe, expect, it } from 'vitest';

import {
  cornerReactionChips,
  displayReactionType,
  isWritableReactionType,
  PICKER_REACTION_TYPES,
  reactionMarkFile,
  reactionPickerLabel,
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
