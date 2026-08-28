import { describe, expect, it } from 'vitest';

import {
  asClipReactionType,
  clipReactionEmoji,
  commentsBandHeight,
  DEFAULT_CLIP_REACTION,
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

  it('sizes the comments video band at ~42%', () => {
    expect(commentsBandHeight(700)).toBe(294);
    expect(commentsBandHeight(0)).toBe(280);
  });
});
