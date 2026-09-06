import { formatDuration } from '@/lib/lift/duration';
import { newRound, roundsTotalSeconds, tabataTemplate } from '@/lib/lift/rounds';
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
  detail: string;
  build: () => LiftRound[];
};

/** `count` repeats of work-then-recover, the shape every interval preset below is made of. */
function pairs(onSeconds: number, offSeconds: number, count: number): LiftRound[] {
  const rounds: LiftRound[] = [];
  for (let index = 0; index < count; index += 1) {
    rounds.push(newRound('on', { seconds: onSeconds }));
    rounds.push(newRound('off', { seconds: offSeconds }));
  }
  return rounds;
}

/**
 * Four starting points, not a library.
 *
 * These cover most of what people set a gym timer to. Anything else is a few taps in the editor
 * underneath, so a longer list would cost more to read than it saves.
 */
export const TIMER_PRESETS: readonly TimerPreset[] = [
  {
    id: 'tabata',
    name: 'Tabata',
    detail: '8 × 0:20 / 0:10 · 4:00',
    build: () => tabataTemplate(),
  },
  {
    id: 'forty-twenty',
    name: '40 / 20',
    detail: '8 × 0:40 / 0:20 · 8:00',
    build: () => pairs(40, 20, 8),
  },
  {
    id: 'thirty-thirty',
    name: '30 / 30',
    detail: '10 × 0:30 / 0:30 · 10:00',
    build: () => pairs(30, 30, 10),
  },
  {
    id: 'minute-rounds',
    name: 'Minute rounds',
    detail: '5 × 1:00 / 0:30 · 7:30',
    build: () => pairs(60, 30, 5),
  },
];

const STORE_KEY = 'blob.timer.rounds';

/** Survives navigating away and back even where there is no web storage to fall back on. */
let cached: LiftRound[] | null = null;

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
  return tabataTemplate();
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

/** "8 rounds · 4:00" — the one line that says whether this is the timer they wanted. */
export function timerSummary(rounds: readonly LiftRound[]): string {
  if (!rounds.length) {
    return 'No rounds yet';
  }
  const label = rounds.length === 1 ? 'round' : 'rounds';
  return `${rounds.length} ${label} · ${formatDuration(roundsTotalSeconds(rounds))}`;
}
