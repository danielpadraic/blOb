/**
 * The one place that decides whether a workout (or a consecutive stack of them) can stand as
 * challenge proof.
 *
 * Both callers share it on purpose: the Home composer uses it to decide whether to offer "also count
 * this toward {challenge}", and /submit uses it to accept or refuse the same attach. If these two ever
 * disagreed, the app would invite someone to check in and then reject them.
 *
 * Social posting does not come through here. Any vendor session can go to the feed, including a
 * twelve-minute walk — this gate is only about proof.
 */

import type { CheckinHealthSource } from '@/lib/health/checkinHealthProof';

/** A candidate session: a HealthKit workout, a stored workout_session, or a lift session. */
export type GateWorkout = {
  id: string;
  source: CheckinHealthSource;
  /** Vendor sessions always carry a real window. Absent clocks are never synthesized. */
  startedAt?: string | null;
  endedAt?: string | null;
  /** As stated by the vendor. Never derived from the window. */
  durationSec?: number | null;
  avgHrBpm?: number | null;
};

/** Two sessions closer than this are one effort with a breather between them. */
export const STACK_GAP_MAX_SEC = 600;

/** The floor for proof when a challenge does not ask for more. */
export const PROOF_MIN_MINUTES = 30;

/** Shown when intensity cannot be judged because we do not know how old they are. */
export const ELEVATED_HR_NEEDS_AGE = 'Add your birth year in You to verify intensity.';

export type WorkoutRejection = {
  id: string;
  /**
   * - `source`: hand-entered or read off a screenshot, so it cannot be auto-proof
   * - `no-clock`: missing a start or end, so it cannot be placed in a chain
   * - `overlap`: runs back over a session already in the chain
   * - `gap`: too far from the chain to be the same effort
   * - `hr`: real, but not intense enough for an elevated-HR challenge
   */
  reason: 'source' | 'no-clock' | 'overlap' | 'gap' | 'hr';
};

function vendorSource(source: CheckinHealthSource): boolean {
  return source === 'healthkit' || source === 'health_connect';
}

function clockMs(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

function statedDuration(workout: GateWorkout): number {
  const seconds = Number(workout.durationSec);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
}

export function ageFromBirthDate(birthDate?: string | null, now = new Date()): number | null {
  const born = birthDate ? new Date(birthDate) : null;
  if (!born || Number.isNaN(born.getTime())) {
    return null;
  }
  let age = now.getFullYear() - born.getFullYear();
  const monthDelta = now.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) {
    age -= 1;
  }
  // Outside this range the number is a typo or a joke, not an age to compute a heart rate from.
  return age >= 5 && age <= 120 ? age : null;
}

export type ElevatedHrInput = {
  /** profiles.date_of_birth. */
  birthDate?: string | null;
  /** Only present when the platform could read it. Absent falls back to the age-only rule. */
  restingHrBpm?: number | null;
};

export type ElevatedHrThreshold =
  /** Karvonen: resting plus 40% of the gap up to estimated max. Personal, so it is preferred. */
  | { kind: 'reserve'; bpm: number; age: number; restingHrBpm: number }
  /** Half of estimated max. Coarser, but honest when resting heart rate is unknown. */
  | { kind: 'estimated-max'; bpm: number; age: number }
  /** No usable birth date, so intensity cannot be judged at all. */
  | { kind: 'unknown-age' };

/**
 * The average heart rate a workout must reach to count on an elevated-HR challenge.
 *
 * Deliberately derived from the person rather than a flat "+30 bpm": the same absolute bump means
 * very different effort for a 25-year-old and a 65-year-old.
 */
export function elevatedHrThreshold(
  input: ElevatedHrInput,
  now = new Date(),
): ElevatedHrThreshold {
  const age = ageFromBirthDate(input.birthDate, now);
  if (age == null) {
    return { kind: 'unknown-age' };
  }
  const estimatedMax = 220 - age;
  const resting = Number(input.restingHrBpm);
  // A resting rate at or above estimated max is a bad reading; the age-only rule is safer than
  // trusting it.
  if (Number.isFinite(resting) && resting > 0 && resting < estimatedMax) {
    return {
      kind: 'reserve',
      bpm: Math.round(resting + 0.4 * (estimatedMax - resting)),
      age,
      restingHrBpm: Math.round(resting),
    };
  }
  return { kind: 'estimated-max', bpm: Math.round(0.5 * estimatedMax), age };
}

export type WorkoutStack = {
  /** Consecutive, non-overlapping sessions, oldest first. */
  chain: GateWorkout[];
  /** Summed stated durations, never the wall-clock span — the gaps are not exercise. */
  durationSec: number;
  rejected: WorkoutRejection[];
};

/**
 * Builds the consecutive chain out of a selection.
 *
 * Anchored on the earliest session that has real clocks. A later session joins if it starts within
 * ten minutes of the chain's end; anything overlapping or further out is dropped with a reason rather
 * than silently folded into the total.
 */
export function stackWorkouts(workouts: GateWorkout[]): WorkoutStack {
  const rejected: WorkoutRejection[] = [];
  const dated: Array<{ workout: GateWorkout; start: number; end: number }> = [];

  for (const workout of workouts) {
    const start = clockMs(workout.startedAt);
    const end = clockMs(workout.endedAt);
    if (start == null || end == null || end <= start) {
      rejected.push({ id: workout.id, reason: 'no-clock' });
      continue;
    }
    dated.push({ workout, start, end });
  }

  dated.sort((left, right) => left.start - right.start || left.end - right.end);

  const chain: GateWorkout[] = [];
  let chainEnd: number | null = null;
  for (const row of dated) {
    if (chainEnd == null) {
      chain.push(row.workout);
      chainEnd = row.end;
      continue;
    }
    if (row.start < chainEnd) {
      rejected.push({ id: row.workout.id, reason: 'overlap' });
      continue;
    }
    if (row.start - chainEnd > STACK_GAP_MAX_SEC * 1000) {
      rejected.push({ id: row.workout.id, reason: 'gap' });
      continue;
    }
    chain.push(row.workout);
    chainEnd = row.end;
  }

  return {
    chain,
    durationSec: chain.reduce((total, workout) => total + statedDuration(workout), 0),
    rejected,
  };
}

export type ProofGateRules = {
  /** challenges.min_minutes. Anything below the product floor is raised to it. */
  minMinutes?: number | null;
  /** True when the challenge requires a proof with method `hr`. */
  requiresElevatedHr?: boolean;
};

export type ProofGateResult = {
  ok: boolean;
  /** User-facing copy when this cannot be proof. Null when it can. */
  reason: string | null;
  /** Sessions that count, oldest first. On an elevated-HR challenge, only the intense ones. */
  countedIds: string[];
  /** Minutes that count toward the challenge. */
  countedSec: number;
  /** Minutes required, after applying the floor. */
  requiredSec: number;
  rejected: WorkoutRejection[];
  /** How intensity was judged, for copy and for showing our work. Null when not required. */
  threshold: ElevatedHrThreshold | null;
};

export function proofMinutesFloor(minMinutes?: number | null): number {
  const asked = Number(minMinutes);
  return Number.isFinite(asked) && asked > PROOF_MIN_MINUTES ? Math.round(asked) : PROOF_MIN_MINUTES;
}

function shortfallReason(countedSec: number, requiredSec: number, elevated: boolean): string {
  const need = Math.round(requiredSec / 60);
  const have = Math.floor(countedSec / 60);
  if (countedSec === 0) {
    return elevated ? `No workout reached the intensity for ${need} min` : `Needs at least ${need} min`;
  }
  return `${have} of ${need} min`;
}

/**
 * Decides whether a selection can be proof for one challenge.
 *
 * Order matters for the message the user sees: a hand-entered session is refused for what it is
 * before we start talking about minutes, and on an elevated-HR challenge the intensity filter runs
 * before stacking so that only qualifying segments contribute time.
 */
export function evaluateWorkoutProof(input: {
  workouts: GateWorkout[];
  rules: ProofGateRules;
  hr?: ElevatedHrInput;
  now?: Date;
}): ProofGateResult {
  const requiredSec = proofMinutesFloor(input.rules.minMinutes) * 60;
  const rejected: WorkoutRejection[] = [];

  const vendor: GateWorkout[] = [];
  for (const workout of input.workouts) {
    if (vendorSource(workout.source)) {
      vendor.push(workout);
    } else {
      // A screenshot read or a typed-in number cannot clear an auto-proof gate, official or not.
      rejected.push({ id: workout.id, reason: 'source' });
    }
  }

  if (vendor.length === 0) {
    return {
      ok: false,
      reason: 'Attach a Watch or Health workout to use this as proof',
      countedIds: [],
      countedSec: 0,
      requiredSec,
      rejected,
      threshold: null,
    };
  }

  let eligible = vendor;
  let threshold: ElevatedHrThreshold | null = null;
  if (input.rules.requiresElevatedHr) {
    threshold = elevatedHrThreshold(input.hr ?? {}, input.now);
    if (threshold.kind === 'unknown-age') {
      return {
        ok: false,
        reason: ELEVATED_HR_NEEDS_AGE,
        countedIds: [],
        countedSec: 0,
        requiredSec,
        rejected,
        threshold,
      };
    }
    const floor = threshold.bpm;
    const intense: GateWorkout[] = [];
    for (const workout of eligible) {
      const avg = Number(workout.avgHrBpm);
      if (Number.isFinite(avg) && avg >= floor) {
        intense.push(workout);
      } else {
        rejected.push({ id: workout.id, reason: 'hr' });
      }
    }
    eligible = intense;
  }

  const stack = stackWorkouts(eligible);
  rejected.push(...stack.rejected);

  const ok = stack.durationSec >= requiredSec && stack.chain.length > 0;
  return {
    ok,
    reason: ok
      ? null
      : shortfallReason(stack.durationSec, requiredSec, Boolean(input.rules.requiresElevatedHr)),
    countedIds: stack.chain.map((workout) => workout.id),
    countedSec: stack.durationSec,
    requiredSec,
    rejected,
    threshold,
  };
}

/** "48 min · 2 workouts" — the one summary line on a stacked post. */
export function workoutStackSummary(countedSec: number, workoutCount: number): string {
  const minutes = Math.round(countedSec / 60);
  const bits = [`${minutes} min`];
  if (workoutCount > 1) {
    bits.push(`${workoutCount} workouts`);
  }
  return bits.join(' · ');
}
