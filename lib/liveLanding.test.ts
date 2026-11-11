import { describe, expect, it, beforeEach, vi } from 'vitest';

import {
  LIVE_USER_INPUT_GRACE_MS,
  LIVE_LAND_WATCH_MAX_MS,
  beginLiveVisit,
  canRepinWhileLanding,
  isUserScrollGesture,
  isUserTakeover,
  clearLiveInitialScroll,
  hasLiveInitialScroll,
  liveLandingFocus,
  logLiveAutoScroll,
  markLiveInitialScroll,
  peekSentLiveCheckin,
  rememberSentLiveCheckin,
  resetLiveLandingForTests,
  shouldLandLiveLatest,
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

  it('lands latest once per visit, after a real viewport', () => {
    const ready = {
      focused: true,
      hasRows: true,
      viewportReady: true,
      alreadyLanded: false,
    };
    expect(shouldLandLiveLatest(ready)).toBe(true);
    expect(shouldLandLiveLatest({ ...ready, focused: false })).toBe(false);
    expect(shouldLandLiveLatest({ ...ready, hasRows: false })).toBe(false);
    expect(shouldLandLiveLatest({ ...ready, viewportReady: false })).toBe(false);
    expect(shouldLandLiveLatest({ ...ready, alreadyLanded: true })).toBe(false);
  });

  it('a new visit re-arms the land but keeps a just-sent check-in', () => {
    markLiveInitialScroll('c1');
    rememberSentLiveCheckin('c1', 'post-9');
    beginLiveVisit('c1');
    expect(hasLiveInitialScroll('c1')).toBe(false);
    expect(peekSentLiveCheckin('c1')).toBe('post-9');
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

describe('live landing gestures', () => {
  const idle = { dragging: false, momentum: false, lastInputAt: 0, now: 100_000 };
  it('treats reflow with no input as not the reader', () => {
    expect(isUserScrollGesture(idle)).toBe(false);
    expect(isUserTakeover({ delta: -300, gesture: isUserScrollGesture(idle) })).toBe(false);
  });
  it('counts a drag, momentum, or recent wheel as the reader', () => {
    expect(isUserScrollGesture({ ...idle, dragging: true })).toBe(true);
    expect(isUserScrollGesture({ ...idle, momentum: true })).toBe(true);
    expect(isUserScrollGesture({ ...idle, lastInputAt: idle.now - 100 })).toBe(true);
    expect(isUserScrollGesture({ ...idle, lastInputAt: idle.now - LIVE_USER_INPUT_GRACE_MS - 1 })).toBe(false);
  });
  it('only a gesture-backed upward move is a takeover', () => {
    expect(isUserTakeover({ delta: -40, gesture: true })).toBe(true);
    expect(isUserTakeover({ delta: -2, gesture: true })).toBe(false);
    expect(isUserTakeover({ delta: 40, gesture: true })).toBe(false);
  });
  it('re-pins during the opening land until the reader acts or time runs out', () => {
    const base = { watching: true, tokenMatches: true, userLeftEnd: false, gesture: false, elapsedMs: 100 };
    expect(canRepinWhileLanding(base)).toBe(true);
    expect(canRepinWhileLanding({ ...base, watching: false })).toBe(false);
    expect(canRepinWhileLanding({ ...base, tokenMatches: false })).toBe(false);
    expect(canRepinWhileLanding({ ...base, userLeftEnd: true })).toBe(false);
    expect(canRepinWhileLanding({ ...base, gesture: true })).toBe(false);
    expect(canRepinWhileLanding({ ...base, elapsedMs: LIVE_LAND_WATCH_MAX_MS + 1 })).toBe(false);
  });
});
