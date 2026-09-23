import { describe, expect, it, beforeEach, vi } from 'vitest';

import {
  clearLiveInitialScroll,
  clearLiveMidScroll,
  hasLiveInitialScroll,
  liveLandingFocus,
  logLiveAutoScroll,
  markLiveInitialScroll,
  peekLiveMidScroll,
  peekSentLiveCheckin,
  rememberSentLiveCheckin,
  resetLiveLandingForTests,
  saveLiveMidScroll,
  shouldLandLiveLatest,
  takeLiveMidScroll,
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

  it('lands latest only once, after a real viewport, never on a mid-scroll restore', () => {
    const ready = {
      focused: true,
      hasRows: true,
      viewportReady: true,
      alreadyLanded: false,
      restoringMidScroll: false,
    };
    expect(shouldLandLiveLatest(ready)).toBe(true);
    expect(shouldLandLiveLatest({ ...ready, focused: false })).toBe(false);
    expect(shouldLandLiveLatest({ ...ready, hasRows: false })).toBe(false);
    expect(shouldLandLiveLatest({ ...ready, viewportReady: false })).toBe(false);
    expect(shouldLandLiveLatest({ ...ready, alreadyLanded: true })).toBe(false);
    expect(shouldLandLiveLatest({ ...ready, restoringMidScroll: true })).toBe(false);
  });

  it('keeps a mid-scroll offset for this session’s background only', () => {
    saveLiveMidScroll('c1', 640);
    expect(peekLiveMidScroll('c1')).toBe(640);
    expect(takeLiveMidScroll('c1')).toBe(640);
    expect(peekLiveMidScroll('c1')).toBeNull();
    saveLiveMidScroll('c1', 12);
    clearLiveMidScroll('c1');
    expect(peekLiveMidScroll('c1')).toBeNull();
  });

  it('logs a non-drag scroll with reason, rowId, willScroll, and itemCount', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logLiveAutoScroll({ reason: 'first-paint', rowId: 'p1', willScroll: true, itemCount: 12 });
    expect(spy).toHaveBeenCalledWith('[blob:live]', {
      reason: 'first-paint',
      rowId: 'p1',
      willScroll: true,
      itemCount: 12,
    });
    spy.mockRestore();
  });
});
