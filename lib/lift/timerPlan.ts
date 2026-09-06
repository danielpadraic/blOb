import { clampDuration, formatDuration, splitDuration } from '@/lib/lift/duration';
import {
  clampIntensity,
  DEFAULT_ON_INTENSITY,
  newRound,
  roundsTotalSeconds,
} from '@/lib/lift/rounds';
import type { LiftRound } from '@/lib/lift/types';

/**
 * The interval calculator.
 *
 * Nobody builds a twenty-eight round session by tapping "+ Add round" twenty-eight times. What
 * they actually have in mind is a shape — warm up, sprint a few times, catch your breath, sprint
 * again, cool down — so this is the model of that shape. `expandPlan` turns it into the flat list
 * the timer counts down, and that flat list stays editable afterwards for the one round somebody
 * wants to make different.
 *
 * A plan is deliberately not freeform. Warm-up is first and cool down is last because that is
 * what those words mean, and pinning them there removes two ways to build something nonsensical.
 * Everything in between is an ordered list of interval blocks and rests.
 */

export type TimerIntervalBlock = {
  key: string;
  type: 'intervals';
  onSeconds: number;
  offSeconds: number;
  /** How many times the on-and-off pair repeats. */
  repeat: number;
  intensity: number;
};

export type TimerRestBlock = {
  key: string;
  type: 'rest';
  seconds: number;
};

export type TimerBlock = TimerIntervalBlock | TimerRestBlock;

export type TimerPlan = {
  /** Zero means no warm-up round at all, rather than a round of zero length. */
  warmupSeconds: number;
  blocks: TimerBlock[];
  cooldownSeconds: number;
};

export const MAX_REPEAT = 99;

const DEFAULT_ON = 30;
const DEFAULT_OFF = 60;
const DEFAULT_REPEAT = 4;
const DEFAULT_REST = 120;

/** React needs stable keys across edits, and a counter is enough for a list this size. */
let keySeed = 0;

function nextKey(prefix: string): string {
  keySeed += 1;
  return `${prefix}-${keySeed}`;
}

export function clampRepeat(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) {
    return 1;
  }
  return Math.min(Math.max(Math.round(value), 1), MAX_REPEAT);
}

export function newIntervalBlock(seed?: Partial<Omit<TimerIntervalBlock, 'key' | 'type'>>): TimerIntervalBlock {
  return {
    key: nextKey('intervals'),
    type: 'intervals',
    onSeconds: clampDuration(seed?.onSeconds ?? DEFAULT_ON),
    offSeconds: clampDuration(seed?.offSeconds ?? DEFAULT_OFF),
    repeat: clampRepeat(seed?.repeat ?? DEFAULT_REPEAT),
    intensity: clampIntensity(seed?.intensity ?? DEFAULT_ON_INTENSITY),
  };
}

export function newRestBlock(seconds?: number): TimerRestBlock {
  return { key: nextKey('rest'), type: 'rest', seconds: clampDuration(seconds ?? DEFAULT_REST) };
}

export function emptyPlan(): TimerPlan {
  return { warmupSeconds: 0, blocks: [newIntervalBlock()], cooldownSeconds: 0 };
}

// ------------------------------------------------------------------------------------ block edits

export function addBlock(plan: TimerPlan, block: TimerBlock): TimerPlan {
  return { ...plan, blocks: [...plan.blocks, block] };
}

export function updateBlock(plan: TimerPlan, key: string, patch: Partial<TimerBlock>): TimerPlan {
  return {
    ...plan,
    blocks: plan.blocks.map((block) => {
      if (block.key !== key) {
        return block;
      }
      // Patches only ever come from that block's own controls, so the type cannot change under it.
      const merged = { ...block, ...patch } as TimerBlock;
      return merged.type === 'intervals'
        ? {
            ...merged,
            onSeconds: clampDuration(merged.onSeconds),
            offSeconds: clampDuration(merged.offSeconds),
            repeat: clampRepeat(merged.repeat),
            intensity: clampIntensity(merged.intensity),
          }
        : { ...merged, seconds: clampDuration(merged.seconds) };
    }),
  };
}

/** The last block cannot go: a plan with nothing in the middle has nothing to count down. */
export function removeBlock(plan: TimerPlan, key: string): TimerPlan {
  if (plan.blocks.length <= 1) {
    return plan;
  }
  return { ...plan, blocks: plan.blocks.filter((block) => block.key !== key) };
}

export function duplicateBlock(plan: TimerPlan, key: string): TimerPlan {
  const index = plan.blocks.findIndex((block) => block.key === key);
  if (index < 0) {
    return plan;
  }
  const source = plan.blocks[index];
  const copy: TimerBlock =
    source.type === 'intervals'
      ? { ...source, key: nextKey('intervals') }
      : { ...source, key: nextKey('rest') };
  const blocks = [...plan.blocks];
  blocks.splice(index + 1, 0, copy);
  return { ...plan, blocks };
}

export function moveBlock(plan: TimerPlan, key: string, direction: -1 | 1): TimerPlan {
  const index = plan.blocks.findIndex((block) => block.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= plan.blocks.length) {
    return plan;
  }
  const blocks = [...plan.blocks];
  blocks[index] = plan.blocks[target];
  blocks[target] = plan.blocks[index];
  return { ...plan, blocks };
}

// ---------------------------------------------------------------------------------- the expansion

/**
 * Turns the shape into the rounds the clock actually runs.
 *
 * Zero-length pieces are dropped rather than emitted: an interval block with the off field cleared
 * is a back-to-back work set, not a set punctuated by nothing, and a round of 0:00 would stall the
 * timer on a number that never counts down.
 */
export function expandPlan(plan: TimerPlan): LiftRound[] {
  const rounds: LiftRound[] = [];

  const push = (kind: LiftRound['kind'], seconds: number, intensity?: number) => {
    const total = clampDuration(seconds);
    if (total <= 0) {
      return;
    }
    rounds.push(newRound(kind, { ...splitDuration(total), intensity }));
  };

  push('warmup', plan.warmupSeconds);

  for (const block of plan.blocks) {
    if (block.type === 'rest') {
      push('rest', block.seconds);
      continue;
    }
    for (let index = 0; index < clampRepeat(block.repeat); index += 1) {
      push('on', block.onSeconds, block.intensity);
      push('off', block.offSeconds);
    }
  }

  push('cooldown', plan.cooldownSeconds);

  return rounds;
}

export function planTotalSeconds(plan: TimerPlan): number {
  return roundsTotalSeconds(expandPlan(plan));
}

export function planRoundCount(plan: TimerPlan): number {
  return expandPlan(plan).length;
}

/** "28 rounds · 29:00" — what Generate is about to produce. */
export function planSummary(plan: TimerPlan): string {
  const count = planRoundCount(plan);
  if (!count) {
    return 'Nothing to run yet';
  }
  const label = count === 1 ? 'round' : 'rounds';
  return `${count} ${label} · ${formatDuration(planTotalSeconds(plan))}`;
}

/**
 * The one-line shape under a preset's name.
 *
 * Derived rather than written by hand so a preset can never advertise an interval it does not
 * build. A plain single block gets the readable "8 × 0:20 / 0:10"; anything with a warm-up, a
 * rest, or several blocks is too long for that and falls back to the count.
 */
export function planDetail(plan: TimerPlan): string {
  const [only] = plan.blocks;
  const simple =
    plan.blocks.length === 1 &&
    only?.type === 'intervals' &&
    !plan.warmupSeconds &&
    !plan.cooldownSeconds;

  if (simple && only.type === 'intervals') {
    const work = formatDuration(only.onSeconds);
    const recover = formatDuration(only.offSeconds);
    return `${only.repeat} × ${work} / ${recover} · ${formatDuration(planTotalSeconds(plan))}`;
  }
  return planSummary(plan);
}

/** Reads a stored plan, dropping anything malformed rather than trusting it. */
export function parsePlan(value: unknown): TimerPlan | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  const parsed: TimerBlock[] = [];

  for (const entry of blocks) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const block = entry as Record<string, unknown>;
    if (block.type === 'rest') {
      parsed.push(newRestBlock(Number(block.seconds ?? 0) || 0));
      continue;
    }
    if (block.type === 'intervals') {
      parsed.push(
        newIntervalBlock({
          onSeconds: Number(block.onSeconds ?? 0) || 0,
          offSeconds: Number(block.offSeconds ?? 0) || 0,
          repeat: Number(block.repeat ?? 1) || 1,
          intensity: Number(block.intensity ?? DEFAULT_ON_INTENSITY) || DEFAULT_ON_INTENSITY,
        }),
      );
    }
  }

  if (!parsed.length) {
    return null;
  }
  return {
    warmupSeconds: clampDuration(Number(raw.warmupSeconds ?? 0) || 0),
    blocks: parsed,
    cooldownSeconds: clampDuration(Number(raw.cooldownSeconds ?? 0) || 0),
  };
}
