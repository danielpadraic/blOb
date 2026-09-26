import { afterEach, describe, expect, it } from 'vitest';

import { clearHomeTourCompleted, markHomeTourCompleted } from '@/lib/homeTour';
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
  parseContextualToursSeen,
  profileHasContextualTour,
  resetContextualToursForTests,
  wasContextualTourSeen,
} from '@/lib/contextualTour';

afterEach(() => {
  resetContextualToursForTests();
  clearHomeTourCompleted('user-1');
  clearHomeTourCompleted('user-9');
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

  it('treats a profile column as already seen, even before local hydrate', () => {
    expect(
      wasContextualTourSeen('user-1', 'challenge-live', { contextual_tours_seen: ['challenge-live'] }),
    ).toBe(true);
    expect(profileHasContextualTour({ contextual_tours_seen: ['lift'] }, 'lift')).toBe(true);
    expect(parseContextualToursSeen(['challenge-live', 'nope'])).toEqual(new Set(['challenge-live']));
  });

  it('treats a Home dismiss as seen for Home and Live, not Lift', () => {
    expect(
      wasContextualTourSeen('user-1', 'home-live-pills', { tutorial_completed_at: '2026-09-26T00:00:00.000Z' }),
    ).toBe(true);
    expect(
      wasContextualTourSeen('user-1', 'challenge-live', { tutorial_completed_at: '2026-09-26T00:00:00.000Z' }),
    ).toBe(true);
    expect(
      wasContextualTourSeen('user-1', 'lift', { tutorial_completed_at: '2026-09-26T00:00:00.000Z' }),
    ).toBe(false);
    markHomeTourCompleted('user-9');
    expect(wasContextualTourSeen('user-9', 'challenge-live')).toBe(true);
    clearHomeTourCompleted('user-9');
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
    expect(HOME_LIVE_PILLS_STEPS[0]?.title).toBe('Live rail');
    expect(HOME_LIVE_PILLS_STEPS[0]?.body).toMatch(/See More/);
    expect(CHALLENGE_LIVE_STEPS[0]?.body).toMatch(/thread/);
    expect(copy).not.toMatch(/locker-room|Pulse is live/i);
  });
});
