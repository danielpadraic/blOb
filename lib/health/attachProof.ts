import { format } from 'date-fns';

import {
  isPreWorkoutProof,
  isPostWorkoutProof,
  resolveChallengeProofs,
  type ChallengeProof,
} from '@/lib/challengeProofs';
import {
  parseCheckinHealthProof,
  type CheckinHealthProof,
} from '@/lib/health/checkinHealthProof';
import { meetsMinMinutes } from '@/lib/health/period';
import { formatHealthDuration, healthSourceLabel } from '@/lib/health/proofSummary';
import type { Challenge } from '@/lib/types';
import type { HealthWorkout } from '@/services/health/types';

export type { CheckinHealthProof };
export { parseCheckinHealthProof };

export type HealthAttachRules = {
  minMinutes?: number | null;
  hrRequired?: boolean;
};

export function proofPrefersHealthAttach(
  proof: ChallengeProof | null | undefined,
  challenge?: {
    proofs?: unknown;
    proof_type?: unknown;
    proof_requirements?: Array<{ type?: string; required?: boolean }> | null;
    min_minutes?: number | string | null;
    title?: string | null;
    task?: string | null;
    rules?: string | null;
    description?: string | null;
  } | null,
): boolean {
  if (!proof) {
    return false;
  }
  if (proof.method === 'hr') {
    return true;
  }
  if (proof.method !== 'photo' && proof.method !== 'video') {
    return false;
  }
  if (!challengeNeedsHealthProof(challenge)) {
    return false;
  }
  if (isPreWorkoutProof(proof) || isPostWorkoutProof(proof)) {
    return false;
  }
  const proofs = challenge ? resolveChallengeProofs(challenge) : [];
  if (proofs.some((item) => item.method === 'hr' && item.id !== proof.id)) {
    return false;
  }
  return true;
}

function challengeNeedsHealthProof(
  challenge?: {
    proofs?: unknown;
    proof_type?: unknown;
    proof_requirements?: Array<{ type?: string; required?: boolean }> | null;
    min_minutes?: number | string | null;
    title?: string | null;
    task?: string | null;
    rules?: string | null;
    description?: string | null;
  } | null,
): boolean {
  if (!challenge) {
    return false;
  }
  const proofs = resolveChallengeProofs(challenge);
  if (proofs.some((item) => item.method === 'hr')) {
    return true;
  }
  const minMinutes = Number(challenge.min_minutes);
  if (Number.isFinite(minMinutes) && minMinutes > 1) {
    return true;
  }
  return /\b(run|running|jog|walk|hike|bike|cycl|swim|yoga|strength|lift|cardio|workout|hr|heart[-\s]?rate)\b/i.test(
    [challenge.task, challenge.rules, challenge.description, challenge.title].filter(Boolean).join(' '),
  );
}

export function healthAttachRulesFor(
  proof: ChallengeProof | null | undefined,
  challenge?: Pick<Challenge, 'min_minutes'> | { min_minutes?: number | null } | null,
): HealthAttachRules {
  const challengeMin = Number(challenge?.min_minutes);
  const proofMin = Number(proof?.minutes);
  const mins = [challengeMin, proofMin].filter((value) => Number.isFinite(value) && value > 1);
  return {
    minMinutes: mins.length > 0 ? Math.max(...mins) : null,
    hrRequired: proof?.method === 'hr',
  };
}

export function workoutAttachBlockReason(
  workout: Pick<HealthWorkout, 'durationSec' | 'hrAvg' | 'hrMax'>,
  rules: HealthAttachRules,
): string | null {
  if (!meetsMinMinutes(workout.durationSec, rules.minMinutes)) {
    const min = Math.round(Number(rules.minMinutes));
    return `Needs at least ${min} min`;
  }
  if (rules.hrRequired && !(Number(workout.hrAvg) > 0 || Number(workout.hrMax) > 0)) {
    return 'No heart rate on this workout';
  }
  return null;
}

export function toCheckinHealthProof(workout: HealthWorkout): CheckinHealthProof {
  const snapshot: CheckinHealthProof = {
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    durationSec: workout.durationSec,
    activityType: workout.activityType,
    sourceName: healthSourceLabel(workout.confidence),
  };
  if (Number(workout.hrAvg) > 0) {
    snapshot.avgHrBpm = Math.round(Number(workout.hrAvg));
  }
  if (Number(workout.hrMax) > 0) {
    snapshot.maxHrBpm = Math.round(Number(workout.hrMax));
  }
  if (Number(workout.caloriesKcal) > 0) {
    snapshot.activeEnergyKcal = Math.round(Number(workout.caloriesKcal));
  }
  if (Number(workout.distanceM) > 0) {
    snapshot.distanceMeters = Math.round(Number(workout.distanceM));
  }
  return snapshot;
}

function formatLocalClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return format(date, 'h:mm a');
}

/** Complete-post line: time window, duration, avg HR when present. */
export function healthCompleteSummaryLine(snapshot: CheckinHealthProof): string {
  const start = formatLocalClock(snapshot.startedAt);
  const end = formatLocalClock(snapshot.endedAt);
  const window = start && end ? `${start}–${end}` : start || end;
  const bits = [
    window,
    formatHealthDuration(snapshot.durationSec),
    snapshot.avgHrBpm && snapshot.avgHrBpm > 0 ? `Avg HR ${Math.round(snapshot.avgHrBpm)}` : null,
  ].filter(Boolean);
  return bits.join(' · ');
}

export function composeCheckinNotes(
  caption: string,
  snapshot?: CheckinHealthProof | null,
): string | null {
  const user = caption.trim();
  const summary = snapshot ? healthCompleteSummaryLine(snapshot) : '';
  if (summary && user && user !== summary && !user.startsWith(`${summary}\n`)) {
    return `${summary}\n${user}`;
  }
  return summary || user || null;
}

export function stripHealthSummaryFromNotes(
  notes: string,
  snapshot?: CheckinHealthProof | null,
): string {
  const text = notes.trim();
  if (!text) {
    return '';
  }
  const summary = snapshot ? healthCompleteSummaryLine(snapshot) : '';
  if (summary && (text === summary || text.startsWith(`${summary}\n`))) {
    return text.slice(summary.length).replace(/^\n/, '').trim();
  }
  return text;
}

