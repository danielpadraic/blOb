import { describe, expect, it } from 'vitest';

import {
  asClipReactionType,
  clipReactionEmoji,
  commentReactionWrite,
  commentsDrawerHeight,
  DEFAULT_CLIP_REACTION,
  shouldAdvanceAfterCommentsClose,
  shouldHoldClipPlayback,
} from '@/lib/clipReactions';

describe('clip reactions', () => {
  it('defaults tap to Heart', () => {
    expect(DEFAULT_CLIP_REACTION).toBe('love');
    expect(asClipReactionType(null)).toBe('love');
    expect(clipReactionEmoji('love')).toBe('❤️');
  });

  it('keeps the eight picker types', () => {
    expect(asClipReactionType('laugh')).toBe('laugh');
    expect(asClipReactionType('shock')).toBe('shock');
    expect(asClipReactionType('applause')).toBe('applause');
    expect(asClipReactionType('praise')).toBe('praise');
  });

  it('sizes the frosted comments drawer at ~40%, ~48% with the keyboard', () => {
    expect(commentsDrawerHeight(700)).toBe(280);
    expect(commentsDrawerHeight(700, true)).toBe(336);
    expect(commentsDrawerHeight(0)).toBe(180);
  });

  it('writes one reaction per user per comment', () => {
    expect(commentReactionWrite(null, 'love')).toBe('insert');
    expect(commentReactionWrite('love', 'love')).toBe('delete');
    expect(commentReactionWrite('love', 'fire')).toBe('update');
  });

  it('holds the current clip while comments or the keyboard are open', () => {
    expect(shouldHoldClipPlayback({ commentsOpen: true, keyboardVisible: false })).toBe(true);
    expect(shouldHoldClipPlayback({ commentsOpen: false, keyboardVisible: true })).toBe(true);
    expect(shouldHoldClipPlayback({ commentsOpen: false, keyboardVisible: false })).toBe(false);
    expect(shouldAdvanceAfterCommentsClose({ kind: 'wave', endedWhileOpen: true })).toBe(true);
    expect(shouldAdvanceAfterCommentsClose({ kind: 'round', endedWhileOpen: true })).toBe(false);
  });
});
