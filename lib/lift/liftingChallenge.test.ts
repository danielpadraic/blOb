import { describe, expect, it } from 'vitest';

import { isLiftingChallenge, liftingChallenges } from '@/lib/lift/liftingChallenge';

describe('spotting a lifting challenge', () => {
  it('matches the words people actually write for lifting', () => {
    expect(isLiftingChallenge({ task: 'lifting' })).toBe(true);
    expect(isLiftingChallenge({ task: 'Lift 4x a week' })).toBe(true);
    expect(isLiftingChallenge({ title: 'Summer Strength' })).toBe(true);
    expect(isLiftingChallenge({ task: 'Bench press PR' })).toBe(true);
    expect(isLiftingChallenge({ task: '100 squats' })).toBe(true);
    expect(isLiftingChallenge({ task: 'Push pull legs' })).toBe(true);
    expect(isLiftingChallenge({ title: 'Powerlifting block' })).toBe(true);
    expect(isLiftingChallenge({ task: 'Weight training, 45 min' })).toBe(true);
  });

  it('reads the task list as well as the title', () => {
    expect(isLiftingChallenge({ title: 'March', tasks: [{ name: 'Deadlift' }] })).toBe(true);
    expect(isLiftingChallenge({ title: 'March', tasks: ['barbell work'] })).toBe(true);
  });

  it('does not offer a lift as proof for cardio', () => {
    expect(isLiftingChallenge({ task: 'Run 3 miles' })).toBe(false);
    expect(isLiftingChallenge({ task: '10,000 steps' })).toBe(false);
    expect(isLiftingChallenge({ title: 'Cycling streak' })).toBe(false);
    expect(isLiftingChallenge({ task: 'Yoga every morning' })).toBe(false);
    expect(isLiftingChallenge({ task: 'Read 20 pages' })).toBe(false);
  });

  it('treats a bare gym mention next to cardio as cardio', () => {
    expect(isLiftingChallenge({ task: 'Gym session' })).toBe(true);
    expect(isLiftingChallenge({ task: 'Gym day: run 5k on the treadmill' })).toBe(false);
  });

  it('still counts a challenge that names lifting alongside cardio', () => {
    expect(isLiftingChallenge({ task: 'Lift or run, 5 days a week' })).toBe(true);
  });

  it('says no to an empty or missing challenge', () => {
    expect(isLiftingChallenge(null)).toBe(false);
    expect(isLiftingChallenge({})).toBe(false);
    expect(isLiftingChallenge({ task: '   ' })).toBe(false);
  });

  it('filters a loggable list down to the lifting ones', () => {
    const list = [
      { id: 'a', task: 'Run 3 miles' },
      { id: 'b', task: 'Lifting' },
      { id: 'c', task: 'Bench press' },
    ];
    expect(liftingChallenges(list).map((row) => row.id)).toEqual(['b', 'c']);
    expect(liftingChallenges(null)).toEqual([]);
  });
});
