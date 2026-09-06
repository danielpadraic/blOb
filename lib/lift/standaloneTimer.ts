import { newRound } from '@/lib/lift/rounds';
import {
  expandPlan,
  newIntervalBlock,
  newRestBlock,
  parsePlan,
  type TimerPlan,
} from '@/lib/lift/timerPlan';
import type { LiftRound } from '@/lib/lift/types';

/**
 * The interval timer that is not attached to a workout.
 *
 * Someone doing Tabata on a bike does not necessarily want a logged lift session out of it, and
 * making them start one to get a clock would be a tax on the thing they actually came for. This is
 * the same rounds model and the same countdown as a cardio row — only the storage differs, because
 * there is no session row to hang it on.
 */

export type TimerPreset = {
  id: string;
  name: string;
  build: () => TimerPlan;
};

/** One interval block and nothing around it, which is what most presets are. */
function single(onSeconds: number, offSeconds: number, repeat: number): TimerPlan {
  return {
    warmupSeconds: 0,
    blocks: [newIntervalBlock({ onSeconds, offSeconds, repeat })],
    cooldownSeconds: 0,
  };
}

/**
 * Five starting points, not a library.
 *
 * Presets are plans rather than finished round lists, so picking one fills the builder in and can
 * then be adjusted — a preset is a starting point, not a dead end. Anything else is a few taps
 * from here, so a longer list would cost more to read than it saves.
 */
export const TIMER_PRESETS: readonly TimerPreset[] = [
  { id: 'tabata', name: 'Tabata', build: () => single(20, 10, 8) },
  { id: 'forty-twenty', name: '40 / 20', build: () => single(40, 20, 8) },
  { id: 'thirty-thirty', name: '30 / 30', build: () => single(30, 30, 10) },
  { id: 'minute-rounds', name: 'Minute rounds', build: () => single(60, 30, 5) },
  {
    // The full shape: warm up, three sets of sprints with a real rest between them, long cool
    // down. This is the one that shows what the builder is for.
    id: 'sprint-sets',
    name: 'Sprint sets',
    build: () => ({
      warmupSeconds: 120,
      blocks: [
        newIntervalBlock({ onSeconds: 30, offSeconds: 60, repeat: 4 }),
        newRestBlock(120),
        newIntervalBlock({ onSeconds: 30, offSeconds: 60, repeat: 4 }),
        newRestBlock(120),
        newIntervalBlock({ onSeconds: 30, offSeconds: 60, repeat: 4 }),
      ],
      cooldownSeconds: 300,
    }),
  },
];

/** What the builder and the clock open on before anyone has built anything. */
export function defaultTimerPlan(): TimerPlan {
  return { warmupSeconds: 0, blocks: [newIntervalBlock({ onSeconds: 20, offSeconds: 10, repeat: 8 })], cooldownSeconds: 0 };
}

const STORE_KEY = 'blob.timer.rounds';
const PLAN_KEY = 'blob.timer.plan';

/** Survives navigating away and back even where there is no web storage to fall back on. */
let cached: LiftRound[] | null = null;
let cachedPlan: TimerPlan | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Safari in a locked-down private window throws on access rather than returning null.
    return null;
  }
}

/**
 * The rounds the timer opens with.
 *
 * A custom interval is worth keeping — someone who built 12 × 0:45 once will want it again next
 * week — so it outlives the screen, and a reload on web. When there is nothing stored yet, Tabata
 * is the answer almost everybody means by "interval timer".
 */
export function loadTimerRounds(): LiftRound[] {
  // An empty list is treated as nothing stored, not as a stored emptiness. Otherwise a timer that
  // once had its rounds cleared would open blank forever with Play disabled and no way back.
  if (cached?.length) {
    return cached.map((round) => ({ ...round }));
  }
  const raw = (() => {
    try {
      return storage()?.getItem(STORE_KEY) ?? null;
    } catch {
      return null;
    }
  })();
  if (raw) {
    try {
      // Round-tripped through the same parser as jsonb from the database, so a hand-edited or
      // stale localStorage value cannot put a malformed round in front of the clock.
      const parsed = parseStored(raw);
      if (parsed.length) {
        cached = parsed;
        return parsed.map((round) => ({ ...round }));
      }
    } catch {
      // Fall through to the default rather than opening on an empty timer.
    }
  }
  return expandPlan(defaultTimerPlan());
}

/**
 * The shape the builder opens on.
 *
 * Kept separately from the rounds because the two legitimately diverge: Generate produces rounds
 * from the plan, and the rounds can then be hand-edited round by round. Storing only the plan
 * would silently discard those edits on the next visit; storing only the rounds would leave the
 * builder blank in front of a session it clearly built.
 */
export function loadTimerPlan(): TimerPlan {
  if (cachedPlan) {
    return clonePlan(cachedPlan);
  }
  try {
    const raw = storage()?.getItem(PLAN_KEY) ?? null;
    if (raw) {
      const parsed = parsePlan(JSON.parse(raw));
      if (parsed) {
        cachedPlan = parsed;
        return clonePlan(parsed);
      }
    }
  } catch {
    // Fall through to the default rather than opening on an empty builder.
  }
  return defaultTimerPlan();
}

export function saveTimerPlan(plan: TimerPlan): void {
  cachedPlan = clonePlan(plan);
  try {
    storage()?.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch {
    // A preference that cannot be written is not worth failing a workout over.
  }
}

function clonePlan(plan: TimerPlan): TimerPlan {
  return { ...plan, blocks: plan.blocks.map((block) => ({ ...block })) };
}

export function saveTimerRounds(rounds: readonly LiftRound[]): void {
  cached = rounds.map((round) => ({ ...round }));
  try {
    storage()?.setItem(STORE_KEY, JSON.stringify(rounds));
  } catch {
    // A preference that cannot be written is not worth failing a workout over.
  }
}

function parseStored(raw: string): LiftRound[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) =>
      newRound((entry.kind as LiftRound['kind']) ?? 'on', {
        minutes: Number(entry.minutes ?? 0) || 0,
        seconds: Number(entry.seconds ?? 0) || 0,
        intensity: entry.intensity == null ? null : Number(entry.intensity),
      }),
    );
}

