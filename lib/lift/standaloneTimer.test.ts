import { beforeEach, describe, expect, it } from 'vitest';

import { blocksFromRounds, roundsTotalSeconds } from '@/lib/lift/rounds';
import {
  defaultTimerPlan,
  loadTimerPlan,
  loadTimerRounds,
  saveTimerPlan,
  saveTimerRounds,
  TIMER_PRESETS,
} from '@/lib/lift/standaloneTimer';
import { expandPlan, planRoundCount, planTotalSeconds } from '@/lib/lift/timerPlan';
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
  it('builds the interval each preset is named for', () => {
    const expected: Record<string, { rounds: number; seconds: number }> = {
      tabata: { rounds: 16, seconds: 4 * 60 },
      'forty-twenty': { rounds: 16, seconds: 8 * 60 },
      'thirty-thirty': { rounds: 20, seconds: 10 * 60 },
      'minute-rounds': { rounds: 10, seconds: 7 * 60 + 30 },
      // 2:00 warm-up, three sets of 4 × 0:30/1:00 split by 2:00 rests, 5:00 cool down.
      'sprint-sets': { rounds: 28, seconds: 29 * 60 },
    };

    // Every preset is covered, so adding one without a figure here fails rather than slipping by.
    expect(TIMER_PRESETS.map((preset) => preset.id).sort()).toEqual(Object.keys(expected).sort());

    for (const preset of TIMER_PRESETS) {
      const plan = preset.build();
      expect(planRoundCount(plan)).toBe(expected[preset.id].rounds);
      expect(planTotalSeconds(plan)).toBe(expected[preset.id].seconds);
    }
  });

  it('lays the sprint-sets preset out warm-up, sprints, rests, cool down', () => {
    const rounds = expandPlan(TIMER_PRESETS.find((preset) => preset.id === 'sprint-sets')!.build());
    const kinds = rounds.map((round) => round.kind);

    expect(kinds[0]).toBe('warmup');
    expect(kinds[kinds.length - 1]).toBe('cooldown');
    expect(kinds.filter((kind) => kind === 'on')).toHaveLength(12);
    expect(kinds.filter((kind) => kind === 'rest')).toHaveLength(2);
    // The rests land between the sprint sets, never at either end.
    expect(kinds.indexOf('rest')).toBe(9);
  });
});

describe('timer round storage', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // No storage in this environment; the cache resets below still apply.
    }
    saveTimerRounds([]);
    saveTimerPlan(defaultTimerPlan());
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

describe('timer plan storage', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // As above.
    }
    saveTimerPlan(defaultTimerPlan());
  });

  it('round-trips a built plan', () => {
    const plan = TIMER_PRESETS.find((preset) => preset.id === 'sprint-sets')!.build();
    saveTimerPlan(plan);
    const loaded = loadTimerPlan();
    expect(loaded.warmupSeconds).toBe(120);
    expect(loaded.cooldownSeconds).toBe(300);
    expect(loaded.blocks).toHaveLength(5);
    expect(planTotalSeconds(loaded)).toBe(29 * 60);
  });

  it('hands out copies, so editing the result cannot mutate the store', () => {
    saveTimerPlan(defaultTimerPlan());
    const first = loadTimerPlan();
    first.warmupSeconds = 999;
    first.blocks[0].key = 'tampered';
    expect(loadTimerPlan().warmupSeconds).toBe(0);
    expect(loadTimerPlan().blocks[0].key).not.toBe('tampered');
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

  it('treats a warm-up and a cool down as work, so both get a countdown in', () => {
    const blocks = blocksFromRounds([
      { kind: 'warmup', minutes: 2, seconds: 0 },
      { kind: 'cooldown', minutes: 5, seconds: 0 },
    ]);
    expect(blocks.map((block) => block.work)).toEqual([true, true]);
  });
});
