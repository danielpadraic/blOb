import { describe, expect, it } from 'vitest';

import {
  addBlock,
  blockDetail,
  clampRepeat,
  duplicateBlock,
  emptyPlan,
  expandPlan,
  MAX_REPEAT,
  moveBlock,
  newIntervalBlock,
  newRestBlock,
  nextIntervalBlock,
  nextRestBlock,
  parsePlan,
  planDetail,
  planRoundCount,
  planSummary,
  planTotalSeconds,
  removeBlock,
  updateBlock,
  type TimerPlan,
} from '@/lib/lift/timerPlan';

function plan(over?: Partial<TimerPlan>): TimerPlan {
  return {
    warmupSeconds: 0,
    blocks: [newIntervalBlock({ onSeconds: 30, offSeconds: 60, repeat: 2 })],
    cooldownSeconds: 0,
    ...over,
  };
}

describe('expandPlan', () => {
  it('repeats the on-and-off pair the stated number of times', () => {
    const rounds = expandPlan(plan());
    expect(rounds.map((round) => round.kind)).toEqual(['on', 'off', 'on', 'off']);
    expect(planTotalSeconds(plan())).toBe(2 * 90);
  });

  it('puts the warm-up first and the cool down last', () => {
    const rounds = expandPlan(plan({ warmupSeconds: 120, cooldownSeconds: 300 }));
    expect(rounds[0].kind).toBe('warmup');
    expect(rounds[0].minutes).toBe(2);
    expect(rounds[rounds.length - 1].kind).toBe('cooldown');
    expect(rounds[rounds.length - 1].minutes).toBe(5);
  });

  it('omits a warm-up and cool down left at zero rather than emitting empty rounds', () => {
    // 0:00 is how the builder says "skip it", so it must not become a round the clock sits on.
    const rounds = expandPlan(plan({ warmupSeconds: 0, cooldownSeconds: 0 }));
    expect(rounds.map((round) => round.kind)).not.toContain('warmup');
    expect(rounds.map((round) => round.kind)).not.toContain('cooldown');
  });

  it('drops the recovery when off is cleared, giving back-to-back work', () => {
    const rounds = expandPlan(
      plan({ blocks: [newIntervalBlock({ onSeconds: 30, offSeconds: 0, repeat: 3 })] }),
    );
    expect(rounds.map((round) => round.kind)).toEqual(['on', 'on', 'on']);
  });

  it('keeps rest blocks in the order they were placed', () => {
    const rounds = expandPlan(
      plan({
        blocks: [
          newIntervalBlock({ onSeconds: 20, offSeconds: 10, repeat: 1 }),
          newRestBlock(60),
          newIntervalBlock({ onSeconds: 20, offSeconds: 10, repeat: 1 }),
        ],
      }),
    );
    expect(rounds.map((round) => round.kind)).toEqual(['on', 'off', 'rest', 'on', 'off']);
  });

  it('carries the block intensity onto every work round it produces', () => {
    const rounds = expandPlan(
      plan({ blocks: [newIntervalBlock({ onSeconds: 30, offSeconds: 30, repeat: 2, intensity: 6 })] }),
    );
    expect(rounds.filter((round) => round.kind === 'on').map((round) => round.intensity)).toEqual([
      6, 6,
    ]);
    // Recovery has nothing to aim at.
    expect(rounds.find((round) => round.kind === 'off')?.intensity).toBeUndefined();
  });

  it('produces nothing from a block with no time in it', () => {
    expect(
      expandPlan(plan({ blocks: [newIntervalBlock({ onSeconds: 0, offSeconds: 0, repeat: 5 })] })),
    ).toEqual([]);
  });
});

describe('repeat clamping', () => {
  it('never goes below one round', () => {
    expect(clampRepeat(0)).toBe(1);
    expect(clampRepeat(-4)).toBe(1);
  });

  it('caps runaway input', () => {
    expect(clampRepeat(5000)).toBe(MAX_REPEAT);
  });

  it('falls back to one on nonsense', () => {
    expect(clampRepeat(Number.NaN)).toBe(1);
    expect(clampRepeat(null)).toBe(1);
  });
});

describe('block edits', () => {
  it('adds a block at the end', () => {
    const next = addBlock(plan(), newRestBlock(45));
    expect(next.blocks).toHaveLength(2);
    expect(next.blocks[1].type).toBe('rest');
  });

  it('patches only the block asked for, and clamps what it is given', () => {
    const base = plan({ blocks: [newIntervalBlock({ repeat: 2 }), newRestBlock(30)] });
    const next = updateBlock(base, base.blocks[0].key, { repeat: 999 });
    expect(next.blocks[0].type === 'intervals' && next.blocks[0].repeat).toBe(MAX_REPEAT);
    expect(next.blocks[1]).toEqual(base.blocks[1]);
  });

  it('duplicates in place with a fresh key, so React can tell them apart', () => {
    const base = plan();
    const next = duplicateBlock(base, base.blocks[0].key);
    expect(next.blocks).toHaveLength(2);
    expect(next.blocks[1].key).not.toBe(next.blocks[0].key);
    expect(planRoundCount(next)).toBe(planRoundCount(base) * 2);
  });

  it('refuses to remove the last block, which would leave nothing to run', () => {
    const base = plan();
    expect(removeBlock(base, base.blocks[0].key).blocks).toHaveLength(1);
  });

  it('removes a block once there is more than one', () => {
    const base = plan({ blocks: [newIntervalBlock(), newRestBlock(30)] });
    expect(removeBlock(base, base.blocks[1].key).blocks).toHaveLength(1);
  });

  it('reorders blocks and ignores a move off either end', () => {
    const base = plan({ blocks: [newIntervalBlock(), newRestBlock(30)] });
    const swapped = moveBlock(base, base.blocks[0].key, 1);
    expect(swapped.blocks[0].type).toBe('rest');
    expect(moveBlock(base, base.blocks[0].key, -1).blocks).toEqual(base.blocks);
  });
});

describe('plan summaries', () => {
  it('counts the rounds and totals the clock', () => {
    expect(planSummary(plan())).toBe('4 rounds · 3:00');
  });

  it('says so when there is nothing to run', () => {
    expect(planSummary(plan({ blocks: [newIntervalBlock({ onSeconds: 0, offSeconds: 0 })] }))).toBe(
      'Nothing to run yet',
    );
  });

  it('reads a plain interval as its shape', () => {
    expect(planDetail(plan({ blocks: [newIntervalBlock({ onSeconds: 20, offSeconds: 10, repeat: 8 })] })))
      .toBe('8 × 0:20 / 0:10 · 4:00');
  });

  it('falls back to a count once there is a warm-up or a second block', () => {
    expect(planDetail(plan({ warmupSeconds: 120 }))).toBe('5 rounds · 5:00');
  });
});

describe('parsePlan', () => {
  it('round-trips a plan through storage', () => {
    const source = plan({ warmupSeconds: 60, cooldownSeconds: 120 });
    const parsed = parsePlan(JSON.parse(JSON.stringify(source)));
    expect(parsed?.warmupSeconds).toBe(60);
    expect(parsed?.cooldownSeconds).toBe(120);
    expect(parsed && planTotalSeconds(parsed)).toBe(planTotalSeconds(source));
  });

  it('rejects anything that is not a plan', () => {
    expect(parsePlan(null)).toBeNull();
    expect(parsePlan('nope')).toBeNull();
    expect(parsePlan({ blocks: [] })).toBeNull();
  });

  it('skips malformed blocks rather than trusting them', () => {
    const parsed = parsePlan({
      warmupSeconds: 0,
      cooldownSeconds: 0,
      blocks: [{ type: 'nonsense' }, null, { type: 'rest', seconds: 30 }],
    });
    expect(parsed?.blocks).toHaveLength(1);
    expect(parsed?.blocks[0].type).toBe('rest');
  });
});

describe('emptyPlan', () => {
  it('starts with one interval block and no edges', () => {
    const base = emptyPlan();
    expect(base.blocks).toHaveLength(1);
    expect(base.warmupSeconds).toBe(0);
    expect(base.cooldownSeconds).toBe(0);
  });
});

describe('nextIntervalBlock and nextRestBlock', () => {
  it('carries the last interval numbers forward, on its own key', () => {
    const base = plan({
      blocks: [newIntervalBlock({ onSeconds: 45, offSeconds: 15, repeat: 6, intensity: 9 })],
    });
    const next = nextIntervalBlock(base);
    expect(next.onSeconds).toBe(45);
    expect(next.offSeconds).toBe(15);
    expect(next.repeat).toBe(6);
    expect(next.intensity).toBe(9);
    expect(next.key).not.toBe(base.blocks[0].key);
  });

  it('reads past a trailing rest to find the last interval', () => {
    const base = plan({
      blocks: [newIntervalBlock({ onSeconds: 20, offSeconds: 10, repeat: 8 }), newRestBlock(90)],
    });
    expect(nextIntervalBlock(base).onSeconds).toBe(20);
    expect(nextRestBlock(base).seconds).toBe(90);
  });

  it('falls back to the defaults when there is nothing of that kind to copy', () => {
    const base = plan({ blocks: [newRestBlock(30)] });
    expect(nextIntervalBlock(base).onSeconds).toBe(30);
    expect(nextIntervalBlock(base).repeat).toBe(4);
  });

  it('edits the copy without touching the block it came from', () => {
    const base = plan({ blocks: [newIntervalBlock({ onSeconds: 30, offSeconds: 60, repeat: 4 })] });
    const grown = addBlock(base, nextIntervalBlock(base));
    const changed = updateBlock(grown, grown.blocks[1].key, { onSeconds: 90 });
    const [first, second] = changed.blocks;
    expect(first.type === 'intervals' && first.onSeconds).toBe(30);
    expect(second.type === 'intervals' && second.onSeconds).toBe(90);
  });
});

describe('blockDetail', () => {
  it('reads an interval block out loud', () => {
    expect(blockDetail(newIntervalBlock({ onSeconds: 30, offSeconds: 60, repeat: 4 }))).toBe(
      '4 × 0:30 / 1:00',
    );
  });

  it('drops the recovery half when there is none', () => {
    expect(blockDetail(newIntervalBlock({ onSeconds: 45, offSeconds: 0, repeat: 3 }))).toBe(
      '3 × 0:45',
    );
  });

  it('gives a rest its own duration', () => {
    expect(blockDetail(newRestBlock(120))).toBe('2:00');
  });

  it('says a zeroed rest is off rather than printing 0:00', () => {
    expect(blockDetail(newRestBlock(0))).toBe('Off — set a time to add it');
  });
});
