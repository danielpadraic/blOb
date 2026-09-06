import { describe, expect, it } from 'vitest';

import { isFitnessShapedChallenge } from '@/lib/health/fitnessShaped';

/**
 * These fixtures are the real live rows on blOb-app, including the default `min_minutes: 30` that
 * every challenge carries. Prayer having that default is why the looser classifier let a pickleball
 * session be offered to it.
 */
const THIRTY_DAY = {
  title: '30-Day Consistency',
  category: 'fitness',
  min_minutes: 30,
  proof_type: 'photo',
  task: 'Exercise for 30-minutes',
  description: 'Workout every day! Allowed 6-total misses/days off during the challenge.',
  proofs: [
    { id: 'a', name: 'Pre', method: 'photo' },
    { id: 'b', name: 'Post', method: 'photo' },
    { id: 'c', name: 'Heart rate', method: 'hr' },
  ],
};

const RUN_128 = {
  title: 'Run 128 Miles by January 1',
  category: 'fitness',
  min_minutes: 30,
  proof_type: 'distance',
  task: 'Run/walk. Must be intentional exercise (no daily totals).',
  description: 'This is a cumulative running/walking challenge. Run 128 miles total.',
  proofs: [
    { id: 'a', name: 'Distance', method: 'distance' },
    { id: 'b', name: 'Photo', method: 'photo' },
  ],
};

const PRAYER = {
  title: 'Prayer Challenge',
  category: 'productivity',
  min_minutes: 30,
  proof_type: 'photo',
  task: 'Pray for somebody',
  description: 'Pray for friends. Share encouragement. Earn points.',
  proofs: [] as { id: string; name: string; method: string }[],
};

const HONOR_TEST = {
  title: 'TEST Even-split — most remaining',
  category: 'fitness',
  min_minutes: 30,
  proof_type: 'honor',
  task: 'Honor check-in (TEST)',
  description: '',
  proofs: [] as { id: string; name: string; method: string }[],
};

describe('which challenges a workout may be offered to', () => {
  it('offers the heart-rate challenge', () => {
    expect(isFitnessShapedChallenge(THIRTY_DAY as never)).toBe(true);
  });

  it('offers the cumulative distance challenge', () => {
    expect(isFitnessShapedChallenge(RUN_128 as never)).toBe(true);
  });

  it('never offers Prayer, even though it carries the default 30 minutes', () => {
    expect(isFitnessShapedChallenge(PRAYER as never)).toBe(false);
  });

  it('never offers an honor-only non-fitness check-in', () => {
    expect(isFitnessShapedChallenge(HONOR_TEST as never)).toBe(false);
  });

  it('ignores min_minutes entirely, because every row has the same default', () => {
    // Same wording, same default minutes, no effort proof: still not a fitness challenge.
    expect(isFitnessShapedChallenge({ ...PRAYER, min_minutes: 30 } as never)).toBe(false);
    expect(isFitnessShapedChallenge({ ...PRAYER, min_minutes: 120 } as never)).toBe(false);
  });

  it('says nothing about a missing challenge', () => {
    expect(isFitnessShapedChallenge(null)).toBe(false);
    expect(isFitnessShapedChallenge(undefined)).toBe(false);
    expect(isFitnessShapedChallenge({})).toBe(false);
  });
});

describe('effort proof methods are enough on their own', () => {
  it('accepts heart rate, distance, steps, workout and duration proofs', () => {
    for (const method of ['hr', 'distance', 'steps', 'workout', 'duration']) {
      expect(isFitnessShapedChallenge({ proofs: [{ id: 'p', name: 'P', method }] } as never)).toBe(true);
      expect(isFitnessShapedChallenge({ proof_type: method } as never)).toBe(true);
    }
  });

  it('does not accept a photo-only or honor-only chore', () => {
    expect(isFitnessShapedChallenge({ proofs: [{ id: 'p', name: 'P', method: 'photo' }] } as never)).toBe(
      false,
    );
    expect(isFitnessShapedChallenge({ proof_type: 'photo', task: 'Make your bed' } as never)).toBe(false);
    expect(isFitnessShapedChallenge({ proof_type: 'honor', task: 'Read a chapter' } as never)).toBe(false);
    expect(isFitnessShapedChallenge({ proof_type: 'checkin', task: 'Acknowledge the memo' } as never)).toBe(
      false,
    );
  });
});

describe('fitness wording the user listed', () => {
  const shaped = [
    'Walk 10,000 steps',
    'Run a 5k',
    'Ride the peloton',
    'Lift weights',
    'Go to the gym',
    'Play a sport',
    'Pickleball with the team',
    'Log a workout',
    'Swim laps',
    'Hike the foothills',
    'Track your distance',
    'Keep your heart rate up',
    'Cycling on the trainer',
  ];

  for (const task of shaped) {
    it(`treats "${task}" as fitness-shaped`, () => {
      expect(isFitnessShapedChallenge({ task, proof_type: 'photo' } as never)).toBe(true);
    });
  }

  const notShaped = [
    'Pray for somebody',
    'Acknowledge the safety memo',
    'Photo of your made bed',
    'Read to your kids',
    'Call your mother',
    'Write in your journal',
    'Practice piano',
  ];

  for (const task of notShaped) {
    it(`leaves "${task}" out`, () => {
      expect(isFitnessShapedChallenge({ task, proof_type: 'photo' } as never)).toBe(false);
    });
  }

  it('reads wording out of a nested task list too', () => {
    expect(
      isFitnessShapedChallenge({
        proof_type: 'photo',
        tasks: [{ label: 'Run three miles' }],
      } as never),
    ).toBe(true);
  });
});
