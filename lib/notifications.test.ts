import { describe, expect, it } from 'vitest';

import { clipReactionNotifyCopy } from '@/lib/clipNotify';

describe('clip reaction notify copy', () => {
  it('names the Wave and keeps the clip id in the href', () => {
    expect(clipReactionNotifyCopy({ story_id: 'wave-2', href: '/wave/wave-2' })).toEqual({
      one: 'reacted to your Wave',
      many: 'reacted to your Wave',
    });
  });

  it('names the Round from a reel href', () => {
    expect(clipReactionNotifyCopy({ href: '/round/r1' })).toEqual({
      one: 'reacted to your Round',
      many: 'reacted to your Round',
    });
  });
});
