import { clampDuration, formatDuration, joinDuration } from '@/lib/lift/duration';
import type { LiftExerciseDraft, LiftRound, LiftRoundKind } from '@/lib/lift/types';

/**
 * Interval rounds on a single cardio row, and the sequence the Play timer walks.
 *
 * A sprint interval is the same machine over and over, so it is one exercise with many rounds
 * rather than many exercises. Everything here is pure: the editor and the timer read the same
 * functions, which is what keeps "what the card says" and "what the clock does" from drifting.
 */

export const ROUND_KINDS: readonly LiftRoundKind[] = [
  'on',
  'off',
  'rest',
  'warmup',
  'steady',
  'sprint',
  'cooldown',
];

/** The kinds offered in the editor. The rest only appear when appended to a single-block row. */
export const EDITABLE_ROUND_KINDS: readonly LiftRoundKind[] = ['on', 'off', 'rest'];

const LABELS: Record<LiftRoundKind, string> = {
  on: 'Interval ON',
  off: 'Interval OFF',
  rest: 'Rest',
  warmup: 'Warm-up',
  steady: 'Steady',
  sprint: 'Sprint',
  cooldown: 'Cool down',
};

/** Short enough for a chip in a crowded row. */
const SHORT_LABELS: Record<LiftRoundKind, string> = {
  on: 'ON',
  off: 'OFF',
  rest: 'Rest',
  warmup: 'Warm-up',
  steady: 'Steady',
  sprint: 'Sprint',
  cooldown: 'Cool down',
};

export function roundKindLabel(kind: LiftRoundKind): string {
  return LABELS[kind] ?? 'Round';
}

export function roundKindShortLabel(kind: LiftRoundKind): string {
  return SHORT_LABELS[kind] ?? 'Round';
}

/**
 * Whether this block is effort rather than recovery.
 *
 * Work blocks get the three-count and the whistle; recovery does not. Anything that is not an
 * explicit OFF or Rest counts as work, so a warm-up or a cool down still opens with a countdown
 * instead of starting silently under someone's headphones.
 */
export function isWorkRound(kind: LiftRoundKind): boolean {
  return kind !== 'off' && kind !== 'rest';
}

/** Only ON carries a target effort. Recovery has nothing to aim at. */
export function roundHasIntensity(kind: LiftRoundKind): boolean {
  return kind === 'on';
}

export const DEFAULT_ON_SECONDS = 20;
export const DEFAULT_OFF_SECONDS = 10;
export const DEFAULT_ON_INTENSITY = 8;
export const TABATA_PAIRS = 8;

export function roundSeconds(round: LiftRound): number {
  return joinDuration(round.minutes, round.seconds);
}

export function roundsTotalSeconds(rounds: readonly LiftRound[]): number {
  return rounds.reduce((total, round) => total + roundSeconds(round), 0);
}

function fromSeconds(kind: LiftRoundKind, seconds: number, intensity?: number | null): LiftRound {
  const total = clampDuration(seconds);
  const round: LiftRound = {
    kind,
    minutes: Math.floor(total / 60),
    seconds: total % 60,
  };
  if (roundHasIntensity(kind)) {
    round.intensity = clampIntensity(intensity ?? DEFAULT_ON_INTENSITY);
  }
  return round;
}

export function clampIntensity(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) {
    return DEFAULT_ON_INTENSITY;
  }
  return Math.min(Math.max(Math.round(value), 1), 10);
}

export function newRound(kind: LiftRoundKind, seed?: Partial<LiftRound>): LiftRound {
  const fallback = kind === 'off' || kind === 'rest' ? DEFAULT_OFF_SECONDS : DEFAULT_ON_SECONDS;
  const seconds =
    seed && (seed.minutes != null || seed.seconds != null)
      ? joinDuration(seed.minutes ?? 0, seed.seconds ?? 0)
      : fallback;
  return fromSeconds(kind, seconds, seed?.intensity);
}

/**
 * Classic Tabata: twenty seconds of work, ten of recovery, eight times through.
 *
 * This is the shape almost everyone means by "intervals", so switching a cardio row to Interval
 * fills it in rather than presenting an empty list and a plus button. Every round stays editable.
 */
export function tabataTemplate(): LiftRound[] {
  const rounds: LiftRound[] = [];
  for (let pair = 0; pair < TABATA_PAIRS; pair += 1) {
    rounds.push(fromSeconds('on', DEFAULT_ON_SECONDS, DEFAULT_ON_INTENSITY));
    rounds.push(fromSeconds('off', DEFAULT_OFF_SECONDS));
  }
  return rounds;
}

/** The last ON in the list, which is what a new round should look like. */
function lastOn(rounds: readonly LiftRound[]): LiftRound | null {
  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    if (rounds[index].kind === 'on') {
      return rounds[index];
    }
  }
  return null;
}

/**
 * Appends an ON shaped like the last one.
 *
 * Reusing the previous work interval is nearly always right — intervals repeat by definition — and
 * saves retyping 0:20 @ 8 on every round.
 */
export function addRound(rounds: readonly LiftRound[]): LiftRound[] {
  const previous = lastOn(rounds);
  return [
    ...rounds,
    previous
      ? fromSeconds('on', roundSeconds(previous), previous.intensity)
      : fromSeconds('on', DEFAULT_ON_SECONDS, DEFAULT_ON_INTENSITY),
  ];
}

/**
 * Copies the trailing ON+OFF pair, or the last round when the tail is not a pair.
 *
 * Intervals are built in pairs, so "one more round" almost always means one more work-and-recover,
 * not one more work block back to back with the previous one.
 */
export function duplicateLastPair(rounds: readonly LiftRound[]): LiftRound[] {
  if (rounds.length >= 2) {
    const [second, first] = [rounds[rounds.length - 1], rounds[rounds.length - 2]];
    if (first.kind === 'on' && second.kind === 'off') {
      return [...rounds, { ...first }, { ...second }];
    }
  }
  if (!rounds.length) {
    return addRound(rounds);
  }
  return [...rounds, { ...rounds[rounds.length - 1] }];
}

export function duplicateRound(rounds: readonly LiftRound[], index: number): LiftRound[] {
  if (index < 0 || index >= rounds.length) {
    return [...rounds];
  }
  const next = [...rounds];
  next.splice(index + 1, 0, { ...rounds[index] });
  return next;
}

/** Removing the last round would leave a cardio row with an Interval type and nothing to do. */
export function removeRound(rounds: readonly LiftRound[], index: number): LiftRound[] {
  if (rounds.length <= 1 || index < 0 || index >= rounds.length) {
    return [...rounds];
  }
  return rounds.filter((_, at) => at !== index);
}

export function moveRound(
  rounds: readonly LiftRound[],
  index: number,
  direction: -1 | 1,
): LiftRound[] {
  const target = index + direction;
  if (index < 0 || index >= rounds.length || target < 0 || target >= rounds.length) {
    return [...rounds];
  }
  const next = [...rounds];
  next[index] = rounds[target];
  next[target] = rounds[index];
  return next;
}

export function updateRound(
  rounds: readonly LiftRound[],
  index: number,
  patch: Partial<LiftRound>,
): LiftRound[] {
  if (index < 0 || index >= rounds.length) {
    return [...rounds];
  }
  return rounds.map((round, at) => {
    if (at !== index) {
      return round;
    }
    const kind = patch.kind ?? round.kind;
    const seconds =
      patch.minutes != null || patch.seconds != null
        ? joinDuration(patch.minutes ?? round.minutes, patch.seconds ?? round.seconds)
        : roundSeconds(round);
    // Switching to a recovery kind drops the intensity rather than keeping a value the row will
    // not show and the timer will not read.
    return fromSeconds(kind, seconds, patch.intensity ?? round.intensity);
  });
}

/** Reads whatever came back from jsonb, dropping anything malformed instead of trusting it. */
export function parseRounds(value: unknown): LiftRound[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rounds: LiftRound[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const kind = String(raw.kind ?? '') as LiftRoundKind;
    if (!ROUND_KINDS.includes(kind)) {
      continue;
    }
    rounds.push(
      fromSeconds(
        kind,
        joinDuration(Number(raw.minutes ?? 0) || 0, Number(raw.seconds ?? 0) || 0),
        raw.intensity == null ? null : Number(raw.intensity),
      ),
    );
  }
  return rounds;
}

// ------------------------------------------------------------------------------ the play sequence

export type LiftPlayBlock = {
  key: string;
  kind: LiftRoundKind;
  seconds: number;
  intensity: number | null;
  /** Opens with a three-count and a whistle. */
  work: boolean;
};

/**
 * Everything the timer needs to run, and nothing about where it came from.
 *
 * A cardio row inside a lift and the standalone timer off the plus menu both reduce to this, so
 * the countdown, the cues, and the screen lock have exactly one implementation between them.
 */
export type LiftPlaySpec = {
  /** The line under the round label — an exercise on a lift row, a preset name standalone. */
  title: string;
  blocks: LiftPlayBlock[];
};

/**
 * What Play actually counts down.
 *
 * An Interval row plays its rounds. Every other cardio type keeps its single duration block and
 * plays any appended rounds after it — that is the difference between "8 × 0:20" and "a 10 minute
 * steady row, then a couple of finishers". Zero-length blocks are dropped so a half-filled row
 * cannot stall the clock on 0:00.
 */
export function playBlocks(row: LiftExerciseDraft): LiftPlayBlock[] {
  if (row.kind !== 'cardio') {
    return [];
  }
  const blocks: LiftPlayBlock[] = [];

  if (row.cardioType !== 'interval') {
    const main = clampDuration(row.durationSeconds);
    if (main > 0) {
      const kind = (row.cardioType ?? 'steady') as LiftRoundKind;
      blocks.push({
        key: 'main',
        kind: ROUND_KINDS.includes(kind) ? kind : 'steady',
        seconds: main,
        intensity: row.intensity ?? null,
        work: true,
      });
    }
  }

  return [...blocks, ...blocksFromRounds(row.rounds ?? [])];
}

/**
 * Turns a bare rounds list into a play sequence.
 *
 * The standalone timer has no exercise behind it — just rounds — so it builds its sequence from
 * here while a cardio row goes through `playBlocks`. Both end up running the identical engine,
 * which is the point: there is one countdown in the app, not two that drift apart.
 */
export function blocksFromRounds(rounds: readonly LiftRound[]): LiftPlayBlock[] {
  const blocks: LiftPlayBlock[] = [];
  rounds.forEach((round, index) => {
    const seconds = roundSeconds(round);
    if (seconds <= 0) {
      return;
    }
    blocks.push({
      key: `round-${index}`,
      kind: round.kind,
      seconds,
      intensity: roundHasIntensity(round.kind) ? clampIntensity(round.intensity) : null,
      work: isWorkRound(round.kind),
    });
  });
  return blocks;
}

/** Play stays disabled until there is at least one block with time on it. */
export function canPlay(row: LiftExerciseDraft | null | undefined): boolean {
  return Boolean(row && playBlocks(row).length > 0);
}

/**
 * How long a cardio row actually takes.
 *
 * An interval row leaves its single duration field empty — its time lives in the rounds — so
 * anything summarising a session has to ask here rather than read `durationSeconds`, or a
 * four minute Tabata reports as 0:00.
 */
export function cardioRowSeconds(row: LiftExerciseDraft): number {
  return playBlocks(row).reduce((total, block) => total + block.seconds, 0);
}

/** "8 rounds · 4:00" under the card, so the row reads without expanding it. */
export function roundsSummary(rounds: readonly LiftRound[]): string {
  if (!rounds.length) {
    return '';
  }
  const total = roundsTotalSeconds(rounds);
  return `${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'} · ${formatDuration(total)}`;
}
