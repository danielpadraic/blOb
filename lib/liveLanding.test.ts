import { describe, expect, it, beforeEach } from 'vitest';

import {
  clearLiveInitialScroll,
  hasLiveInitialScroll,
  liveLandingFocus,
  markLiveInitialScroll,
  peekSentLiveCheckin,
  rememberSentLiveCheckin,
  resetLiveLandingForTests,
  takeSentLiveCheckin,
} from '@/lib/liveLanding';

describe('live landing', () => {
  beforeEach(() => {
    resetLiveLandingForTests();
  });

  it('remembers the first scroll per challenge and clears only on leave', () => {
    expect(hasLiveInitialScroll('c1')).toBe(false);
    markLiveInitialScroll('c1');
    expect(hasLiveInitialScroll('c1')).toBe(true);
    expect(hasLiveInitialScroll('c2')).toBe(false);
    markLiveInitialScroll('c1');
    expect(hasLiveInitialScroll('c1')).toBe(true);
    clearLiveInitialScroll('c1');
    expect(hasLiveInitialScroll('c1')).toBe(false);
  });

  it('keeps a just-sent check-in until Live consumes it', () => {
    rememberSentLiveCheckin('c1', 'post-9');
    expect(peekSentLiveCheckin('c1')).toBe('post-9');
    expect(takeSentLiveCheckin('c1')).toBe('post-9');
    expect(peekSentLiveCheckin('c1')).toBeNull();
  });

  it('prefers a comment alert, then the sent check-in, then latest', () => {
    expect(liveLandingFocus({ commentId: 'n1', postId: 'p1', sentPostId: 'p2' })).toEqual({
      commentId: 'n1',
      postId: null,
      latest: false,
    });
    expect(liveLandingFocus({ postId: 'p1', sentPostId: 'p2' })).toEqual({
      commentId: null,
      postId: 'p1',
      latest: false,
    });
    expect(liveLandingFocus({ sentPostId: 'p2' })).toEqual({
      commentId: null,
      postId: 'p2',
      latest: false,
    });
    expect(liveLandingFocus({})).toEqual({
      commentId: null,
      postId: null,
      latest: true,
    });
  });
});
