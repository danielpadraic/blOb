import { beforeEach, describe, expect, it } from 'vitest';

import { blocksFromRounds, roundsTotalSeconds } from '@/lib/lift/rounds';
import {
  loadTimerRounds,
  saveTimerRounds,
  timerSummary,
  TIMER_PRESETS,
} from '@/lib/lift/standaloneTimer';
import type { LiftRound } from '@/lib/lift/types';

const on = (seconds: number, intensity = 8): LiftRound => ({
  kind: 'on',
  minutes: Math.floor(seconds / 60),
  seconds: seconds % 60,
  intensity,
});

const off = (seconds: number): LiftRound => ({
  kind: 'off',
  minutes: Math.floor(seconds / 60),
  seconds: seconds % 60,
});

describe('timer presets', () => {
  it('builds the interval each preset advertises', () => {
    // The detail line under a preset is the promise it makes. If the two drift, someone picks
    // "8 × 0:40 / 0:20" and gets something else on the clock.
    const expected: Record<string, { rounds: number; seconds: number }> = {
      tabata: { rounds: 16, seconds: 4 * 60 },
      'forty-twenty': { rounds: 16, seconds: 8 * 60 },
      'thirty-thirty': { rounds: 20, seconds: 10 * 60 },
      'minute-rounds': { rounds: 10, seconds: 7 * 60 + 30 },
    };

    for (const preset of TIMER_PRESETS) {
      const rounds = preset.build();
      expect(rounds).toHaveLength(expected[preset.id].rounds);
      expect(roundsTotalSeconds(rounds)).toBe(expected[preset.id].seconds);
    }
  });

  it('alternates work and recovery so no preset stacks two work blocks', () => {
    for (const preset of TIMER_PRESETS) {
      const kinds = preset.build().map((round) => round.kind);
      expect(kinds.filter((kind) => kind === 'on')).toHaveLength(kinds.length / 2);
      kinds.forEach((kind, index) => {
        expect(kind).toBe(index % 2 === 0 ? 'on' : 'off');
      });
    }
  });

  it('gives every work round a target effort and no recovery round one', () => {
    for (const preset of TIMER_PRESETS) {
      for (const round of preset.build()) {
        if (round.kind === 'on') {
          expect(round.intensity).toBeGreaterThan(0);
        } else {
          expect(round.intensity).toBeUndefined();
        }
      }
    }
  });
});

describe('timerSummary', () => {
  it('counts the rounds and totals the clock', () => {
    expect(timerSummary([on(20), off(10)])).toBe('2 rounds · 0:30');
  });

  it('stays singular for one round', () => {
    expect(timerSummary([on(45)])).toBe('1 round · 0:45');
  });

  it('says so when there is nothing to run', () => {
    expect(timerSummary([])).toBe('No rounds yet');
  });
});

describe('timer round storage', () => {
  beforeEach(() => {
    // Each test gets a clean slate, including the in-process cache behind the store.
    try {
      localStorage.clear();
    } catch {
      // No storage in this environment; the cache reset below still applies.
    }
    saveTimerRounds([]);
  });

  it('opens on Tabata before anything has been saved', () => {
    saveTimerRounds([]);
    const rounds = loadTimerRounds();
    expect(rounds).toHaveLength(16);
    expect(roundsTotalSeconds(rounds)).toBe(4 * 60);
  });

  it('gives back the interval that was saved', () => {
    saveTimerRounds([on(45, 9), off(15)]);
    expect(loadTimerRounds()).toEqual([on(45, 9), off(15)]);
  });

  it('hands out copies, so editing the result cannot mutate the store', () => {
    saveTimerRounds([on(30)]);
    const first = loadTimerRounds();
    first[0].minutes = 99;
    expect(loadTimerRounds()[0].minutes).toBe(0);
  });
});

describe('blocksFromRounds', () => {
  it('marks work and recovery the way the timer reads them', () => {
    const blocks = blocksFromRounds([on(20), off(10)]);
    expect(blocks.map((block) => block.work)).toEqual([true, false]);
    expect(blocks.map((block) => block.seconds)).toEqual([20, 10]);
  });

  it('drops empty rounds rather than stalling the clock on 0:00', () => {
    expect(blocksFromRounds([on(20), off(0), on(15)])).toHaveLength(2);
  });

  it('carries intensity on work only', () => {
    const [work, recovery] = blocksFromRounds([on(20, 7), off(10)]);
    expect(work.intensity).toBe(7);
    expect(recovery.intensity).toBeNull();
  });
});
