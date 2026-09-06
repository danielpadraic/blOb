import { describe, expect, it } from 'vitest';

import {
  addRound,
  canPlay,
  DEFAULT_ON_INTENSITY,
  duplicateLastPair,
  duplicateRound,
  isWorkRound,
  moveRound,
  newRound,
  parseRounds,
  playBlocks,
  removeRound,
  roundsSummary,
  roundsTotalSeconds,
  tabataTemplate,
  updateRound,
} from '@/lib/lift/rounds';
import { newTimedDraft } from '@/lib/lift/session';
import type { LiftExerciseDraft, LiftRound } from '@/lib/lift/types';

function airBike(overrides?: Partial<LiftExerciseDraft>): LiftExerciseDraft {
  return {
    ...newTimedDraft({
      kind: 'cardio',
      muscleKey: 'cardio',
      name: 'Air Bike',
      cardioMethod: 'air_bike',
      cardioType: 'interval',
      durationSeconds: 0,
    }),
    ...overrides,
  };
}

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

describe('tabataTemplate', () => {
  it('is 20 on, 10 off, eight times', () => {
    const rounds = tabataTemplate();
    expect(rounds).toHaveLength(16);
    expect(rounds[0]).toEqual({ kind: 'on', minutes: 0, seconds: 20, intensity: 8 });
    expect(rounds[1]).toEqual({ kind: 'off', minutes: 0, seconds: 10 });
    expect(rounds.filter((round) => round.kind === 'on')).toHaveLength(8);
  });

  it('runs four minutes end to end', () => {
    expect(roundsTotalSeconds(tabataTemplate())).toBe(8 * 20 + 8 * 10);
  });
});

describe('addRound', () => {
  it('copies the shape of the last work interval', () => {
    const rounds = addRound([on(30, 9), off(15)]);
    expect(rounds).toHaveLength(3);
    expect(rounds[2]).toEqual({ kind: 'on', minutes: 0, seconds: 30, intensity: 9 });
  });

  it('falls back to 0:20 at 8 when there is no ON to copy', () => {
    const rounds = addRound([]);
    expect(rounds[0]).toEqual({ kind: 'on', minutes: 0, seconds: 20, intensity: 8 });
  });
});

describe('duplicateLastPair', () => {
  it('copies both halves when the tail is ON then OFF', () => {
    const rounds = duplicateLastPair([on(20), off(10)]);
    expect(rounds.map((round) => round.kind)).toEqual(['on', 'off', 'on', 'off']);
    expect(rounds).toHaveLength(4);
  });

  // Two ONs back to back are not a pair, so copying both would invent a recovery block.
  it('copies only the last round when the tail is not a pair', () => {
    const rounds = duplicateLastPair([off(10), on(20)]);
    expect(rounds.map((round) => round.kind)).toEqual(['off', 'on', 'on']);
  });

  it('still produces a round from an empty list', () => {
    expect(duplicateLastPair([])).toHaveLength(1);
  });
});

describe('editing rounds', () => {
  it('drops a copy directly below the original', () => {
    const rounds = duplicateRound([on(20), off(10)], 0);
    expect(rounds.map((round) => round.kind)).toEqual(['on', 'on', 'off']);
  });

  it('keeps at least one round', () => {
    expect(removeRound([on(20)], 0)).toHaveLength(1);
    expect(removeRound([on(20), off(10)], 1)).toHaveLength(1);
  });

  it('reorders within the list', () => {
    const rounds = moveRound([on(20), off(10)], 1, -1);
    expect(rounds.map((round) => round.kind)).toEqual(['off', 'on']);
  });

  it('will not move a round off either end', () => {
    expect(moveRound([on(20), off(10)], 0, -1).map((r) => r.kind)).toEqual(['on', 'off']);
    expect(moveRound([on(20), off(10)], 1, 1).map((r) => r.kind)).toEqual(['on', 'off']);
  });

  it('edits a duration without touching its neighbours', () => {
    const rounds = updateRound([on(20), off(10)], 0, { seconds: 30 });
    expect(rounds[0]).toEqual({ kind: 'on', minutes: 0, seconds: 30, intensity: 8 });
    expect(rounds[1]).toEqual(off(10));
  });

  // Recovery has nothing to aim at, so an intensity carried over from ON would render nowhere.
  it('drops intensity when a round becomes recovery', () => {
    const rounds = updateRound([on(20, 9)], 0, { kind: 'off' });
    expect(rounds[0].intensity).toBeUndefined();
  });

  it('gives intensity back when a round becomes work again', () => {
    const rounds = updateRound([off(10)], 0, { kind: 'on' });
    expect(rounds[0].intensity).toBe(DEFAULT_ON_INTENSITY);
  });

  it('rolls 90 seconds up into 1:30', () => {
    const rounds = updateRound([on(20)], 0, { minutes: 1, seconds: 30 });
    expect(rounds[0].minutes).toBe(1);
    expect(rounds[0].seconds).toBe(30);
  });
});

describe('newRound', () => {
  it('starts recovery shorter than work', () => {
    expect(newRound('on').seconds).toBe(20);
    expect(newRound('off').seconds).toBe(10);
    expect(newRound('rest').seconds).toBe(10);
  });

  it('gives only work an intensity', () => {
    expect(newRound('on').intensity).toBe(8);
    expect(newRound('rest').intensity).toBeUndefined();
  });
});

describe('isWorkRound', () => {
  it('treats recovery as the only non-work kinds', () => {
    expect(isWorkRound('on')).toBe(true);
    expect(isWorkRound('warmup')).toBe(true);
    expect(isWorkRound('cooldown')).toBe(true);
    expect(isWorkRound('off')).toBe(false);
    expect(isWorkRound('rest')).toBe(false);
  });
});

describe('playBlocks', () => {
  it('plays an interval row as its rounds', () => {
    const blocks = playBlocks(airBike({ rounds: tabataTemplate() }));
    expect(blocks).toHaveLength(16);
    expect(blocks[0]).toMatchObject({ kind: 'on', seconds: 20, intensity: 8, work: true });
    expect(blocks[1]).toMatchObject({ kind: 'off', seconds: 10, intensity: null, work: false });
  });

  // A warm-up is one block. Adding rounds appends to it rather than replacing it.
  it('plays a single-block row as its own duration', () => {
    const blocks = playBlocks(
      airBike({ cardioType: 'warmup', durationSeconds: 120, rounds: [] }),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'warmup', seconds: 120, work: true });
  });

  it('appends extra rounds after a single block', () => {
    const blocks = playBlocks(
      airBike({ cardioType: 'warmup', durationSeconds: 120, rounds: [on(20), off(10)] }),
    );
    expect(blocks.map((block) => block.kind)).toEqual(['warmup', 'on', 'off']);
  });

  // The interval duration field is unused, so counting it would add a phantom block.
  it('ignores the single duration on an interval row', () => {
    const blocks = playBlocks(airBike({ durationSeconds: 600, rounds: [on(20)] }));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].seconds).toBe(20);
  });

  it('skips rounds with no time on them', () => {
    const blocks = playBlocks(airBike({ rounds: [on(20), off(0), on(30)] }));
    expect(blocks.map((block) => block.seconds)).toEqual([20, 30]);
  });

  it('has nothing to play for a strength row', () => {
    const blocks = playBlocks({ ...airBike(), kind: 'strength' });
    expect(blocks).toEqual([]);
  });

  it('has nothing to play for a rest row', () => {
    expect(playBlocks({ ...airBike(), kind: 'rest' })).toEqual([]);
  });
});

describe('canPlay', () => {
  it('needs a block with time on it', () => {
    expect(canPlay(airBike({ rounds: [] }))).toBe(false);
    expect(canPlay(airBike({ rounds: [on(0)] }))).toBe(false);
    expect(canPlay(airBike({ rounds: [on(20)] }))).toBe(true);
  });

  it('is false for nothing at all', () => {
    expect(canPlay(null)).toBe(false);
  });
});

describe('parseRounds', () => {
  it('reads what the database gives back', () => {
    const rounds = parseRounds([
      { kind: 'on', minutes: 0, seconds: 20, intensity: 8 },
      { kind: 'off', minutes: 0, seconds: 10 },
    ]);
    expect(rounds).toEqual([on(20), off(10)]);
  });

  it('drops entries it cannot make sense of instead of trusting them', () => {
    const rounds = parseRounds([
      { kind: 'on', minutes: 0, seconds: 20 },
      { kind: 'nonsense', minutes: 1, seconds: 0 },
      'not an object',
      null,
      42,
    ]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].kind).toBe('on');
  });

  it('returns nothing for a non-array', () => {
    expect(parseRounds(null)).toEqual([]);
    expect(parseRounds({ kind: 'on' })).toEqual([]);
    expect(parseRounds(undefined)).toEqual([]);
  });

  it('clamps an out-of-range intensity', () => {
    expect(parseRounds([{ kind: 'on', minutes: 0, seconds: 20, intensity: 99 }])[0].intensity).toBe(
      10,
    );
  });
});

describe('roundsSummary', () => {
  it('reads the list back without expanding it', () => {
    expect(roundsSummary(tabataTemplate())).toBe('16 rounds · 4:00');
    expect(roundsSummary([on(20)])).toBe('1 round · 0:20');
    expect(roundsSummary([])).toBe('');
  });
});
