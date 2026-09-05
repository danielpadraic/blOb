import { describe, expect, it } from 'vitest';

import {
  challengeRequiresElevatedHr,
  workoutPromptTargets,
  workoutPromptTitle,
  type PromptCandidate,
  type PromptChallenge,
} from '@/lib/health/workoutPromptTargets';
import type { GateWorkout } from '@/lib/health/workoutProofGate';
import { checkinPeriodKey } from '@/lib/checkinPeriod';

const NOW = new Date('2026-09-05T20:00:00.000Z');

function session(
  id: string,
  options: { startMin?: number; minutes?: number; avgHr?: number | null } = {},
): GateWorkout {
  const base = Date.parse('2026-09-05T17:00:00.000Z');
  const startMin = options.startMin ?? 0;
  const minutes = options.minutes ?? 35;
  return {
    id,
    source: 'healthkit',
    startedAt: new Date(base + startMin * 60_000).toISOString(),
    endedAt: new Date(base + (startMin + minutes) * 60_000).toISOString(),
    durationSec: minutes * 60,
    avgHrBpm: options.avgHr ?? null,
  };
}

function challenge(overrides: Partial<PromptChallenge> = {}): PromptChallenge {
  return {
    id: 'c-1',
    title: 'Sunrise Miles',
    status: 'live',
    category: 'fitness',
    min_minutes: 30,
    frequency: 'daily',
    starts_at: '2026-09-01T00:00:00.000Z',
    ends_at: '2026-10-01T00:00:00.000Z',
    timezone: 'America/Denver',
    // A photo proof keeps this off the elevated-HR path unless a test asks for one.
    proofs: [{ id: 'photo', name: 'Photo', method: 'photo' }],
    task: 'Run 30 minutes',
    ...overrides,
  };
}

function candidate(overrides: Partial<PromptChallenge> = {}, checkin?: PromptCandidate['checkin']): PromptCandidate {
  return { challenge: challenge(overrides), checkin: checkin ?? null };
}

describe('spotting an elevated heart rate challenge', () => {
  it('is one when a heart rate proof is required', () => {
    expect(
      challengeRequiresElevatedHr(
        challenge({ proofs: [{ id: 'hr', name: 'Heart rate', method: 'hr' }] }),
      ),
    ).toBe(true);
  });

  it('is not one for a photo challenge', () => {
    expect(challengeRequiresElevatedHr(challenge())).toBe(false);
  });
});

describe('which challenges get offered after a Home post', () => {
  const workouts = [session('run', { minutes: 35, avgHr: 140 })];

  it('offers a live fitness challenge with no check-in yet', () => {
    const targets = workoutPromptTargets({ workouts, candidates: [candidate()], now: NOW });
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      challengeId: 'c-1',
      title: 'Sunrise Miles',
      countedIds: ['run'],
      countedSec: 35 * 60,
    });
  });

  it('says nothing when there are no workouts to offer', () => {
    expect(workoutPromptTargets({ workouts: [], candidates: [candidate()], now: NOW })).toEqual([]);
  });

  it('skips a challenge already checked in for this period', () => {
    // Derived rather than hardcoded: the period key is computed from starts_at in the challenge's
    // own timezone, so a literal date here would only be right by luck.
    const done = candidate({}, {
      status: 'submitted',
      submitted_at: NOW.toISOString(),
      period_key: checkinPeriodKey(challenge() as never, NOW),
    });
    expect(workoutPromptTargets({ workouts, candidates: [done], now: NOW })).toEqual([]);
  });

  it('still offers when the period check-in was started but not submitted', () => {
    const draft = candidate({}, {
      status: 'draft',
      submitted_at: null,
      period_key: checkinPeriodKey(challenge() as never, NOW),
    });
    expect(workoutPromptTargets({ workouts, candidates: [draft], now: NOW })).toHaveLength(1);
  });

  it('skips a draft challenge', () => {
    expect(workoutPromptTargets({ workouts, candidates: [candidate({ status: 'draft' })], now: NOW })).toEqual([]);
  });

  it('skips a challenge that has ended', () => {
    const over = candidate({ status: 'ended', ends_at: '2026-09-01T00:00:00.000Z' });
    expect(workoutPromptTargets({ workouts, candidates: [over], now: NOW })).toEqual([]);
  });

  it('skips one that is settling', () => {
    expect(
      workoutPromptTargets({ workouts, candidates: [candidate({ status: 'settling' })], now: NOW }),
    ).toEqual([]);
  });

  /** A corporate lobby stays inside itself; a Home post must not surface one. */
  it('never offers a corporate lobby', () => {
    const corporate = candidate({ privacy_mode: 'private_corporate' });
    expect(workoutPromptTargets({ workouts, candidates: [corporate], now: NOW })).toEqual([]);
  });

  it('skips a challenge whose proof cannot take a workout', () => {
    const prayer = candidate({
      category: 'faith',
      min_minutes: 0,
      proofs: [{ id: 'honor', name: 'Honor', method: 'honor' }],
      task: 'Pray each morning',
      rules: null,
      description: null,
      title: 'Morning prayer',
    });
    expect(workoutPromptTargets({ workouts, candidates: [prayer], now: NOW })).toEqual([]);
  });

  it('skips a challenge asking for more minutes than the workout has', () => {
    const long = candidate({ min_minutes: 60 });
    expect(workoutPromptTargets({ workouts, candidates: [long], now: NOW })).toEqual([]);
  });

  it('offers several at once, each with its own counted minutes', () => {
    const targets = workoutPromptTargets({
      workouts: [session('lift', { startMin: 0, minutes: 18, avgHr: 84 }), session('ball', { startMin: 26, minutes: 32, avgHr: 130 })],
      candidates: [
        candidate({ id: 'c-1', title: 'Sunrise Miles' }),
        candidate({
          id: 'c-2',
          title: 'Heart Rate 30',
          proofs: [{ id: 'hr', name: 'Heart rate', method: 'hr' }],
        }),
      ],
      hr: { birthDate: '1985-01-02' },
      now: NOW,
    });
    expect(targets.map((target) => target.challengeId)).toEqual(['c-1', 'c-2']);
    // The photo challenge counts the whole stack.
    expect(targets[0].countedSec).toBe(50 * 60);
    // The heart rate challenge counts only the segment that cleared the bar.
    expect(targets[1].countedIds).toEqual(['ball']);
    expect(targets[1].countedSec).toBe(32 * 60);
  });

  it('drops an elevated-HR challenge when nothing reached the intensity', () => {
    const targets = workoutPromptTargets({
      workouts: [session('stroll', { minutes: 40, avgHr: 70 })],
      candidates: [
        candidate({ id: 'hr-1', proofs: [{ id: 'hr', name: 'Heart rate', method: 'hr' }] }),
      ],
      hr: { birthDate: '1985-01-02' },
      now: NOW,
    });
    expect(targets).toEqual([]);
  });

  it('carries the birth year nudge through on a challenge it still offers', () => {
    const targets = workoutPromptTargets({
      workouts: [session('run', { minutes: 40, avgHr: 140 })],
      candidates: [
        candidate({ id: 'hr-1', proofs: [{ id: 'hr', name: 'Heart rate', method: 'hr' }] }),
      ],
      hr: {},
      now: NOW,
    });
    expect(targets).toHaveLength(1);
    expect(targets[0].nudge).toBe('Add your birth year in You to verify intensity.');
  });

  it('refuses a screenshot read, however long it claims to be', () => {
    const targets = workoutPromptTargets({
      workouts: [{ ...session('shot', { minutes: 60 }), source: 'ocr' }],
      candidates: [candidate()],
      now: NOW,
    });
    expect(targets).toEqual([]);
  });
});

describe('the prompt heading', () => {
  const target = { challengeId: 'c-1', title: 'Sunrise Miles', countedIds: ['a'], countedSec: 1800, nudge: null };

  it('names the challenge when there is only one', () => {
    expect(workoutPromptTitle([target])).toBe('Also count this toward Sunrise Miles?');
  });

  it('stays general for several', () => {
    expect(workoutPromptTitle([target, { ...target, challengeId: 'c-2', title: 'Heart Rate 30' }])).toBe(
      'Also count this toward these challenges?',
    );
  });
});
