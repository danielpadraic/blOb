import { afterEach, describe, expect, it } from 'vitest';

import {
  CHALLENGE_LIVE_HOST_EMPTY_BODY,
  CHALLENGE_LIVE_STEPS,
  HOME_LIVE_PILLS_STEPS,
  LIFT_HISTORY_STEPS,
  LIFT_TABATA_STEP,
  clearHomeLivePillsTour,
  liftSessionHasInterval,
  liftSessionTourSteps,
  markContextualTourSeen,
  resetContextualToursForTests,
  wasContextualTourSeen,
} from '@/lib/contextualTour';

afterEach(() => {
  resetContextualToursForTests();
});

describe('contextual first-seen flags', () => {
  it('persists home-live-pills, challenge-live, and lift per user', () => {
    expect(wasContextualTourSeen('user-1', 'home-live-pills')).toBe(false);
    markContextualTourSeen('user-1', 'home-live-pills');
    markContextualTourSeen('user-1', 'challenge-live');
    markContextualTourSeen('user-1', 'lift');
    expect(wasContextualTourSeen('user-1', 'home-live-pills')).toBe(true);
    expect(wasContextualTourSeen('user-1', 'challenge-live')).toBe(true);
    expect(wasContextualTourSeen('user-1', 'lift')).toBe(true);
    expect(wasContextualTourSeen('user-2', 'lift')).toBe(false);
  });

  it('clears only the Home Live pills flag on replay', () => {
    markContextualTourSeen('user-1', 'home-live-pills');
    markContextualTourSeen('user-1', 'challenge-live');
    markContextualTourSeen('user-1', 'lift');
    clearHomeLivePillsTour('user-1');
    expect(wasContextualTourSeen('user-1', 'home-live-pills')).toBe(false);
    expect(wasContextualTourSeen('user-1', 'challenge-live')).toBe(true);
    expect(wasContextualTourSeen('user-1', 'lift')).toBe(true);
  });

  it('adds Tabata only when an interval cardio row exists', () => {
    expect(liftSessionHasInterval({ exercises: [{ cardioType: 'steady' }] })).toBe(false);
    expect(liftSessionTourSteps({ exercises: [{ cardioType: 'steady' }] })).toHaveLength(1);
    expect(liftSessionHasInterval({ exercises: [{ cardio_type: 'interval' }] })).toBe(true);
    expect(liftSessionTourSteps({ exercises: [{ cardioType: 'interval' }] })).toEqual([
      expect.objectContaining({ id: 'lift-logging', target: 'tour-lift-log' }),
      LIFT_TABATA_STEP,
    ]);
  });

  it('keeps first-seen copy kind and never prints Bucks', () => {
    const copy = [
      ...HOME_LIVE_PILLS_STEPS,
      ...CHALLENGE_LIVE_STEPS,
      ...LIFT_HISTORY_STEPS,
      LIFT_TABATA_STEP,
    ]
      .map((step) => `${step.title} ${step.body}`)
      .concat(CHALLENGE_LIVE_HOST_EMPTY_BODY)
      .join('\n');
    expect(copy).not.toMatch(/Bucks/i);
    expect(copy).not.toMatch(/I believe/i);
    expect(HOME_LIVE_PILLS_STEPS[0]?.title).toBe('Live');
    expect(HOME_LIVE_PILLS_STEPS[1]?.title).toBe('Pulse');
  });
});
