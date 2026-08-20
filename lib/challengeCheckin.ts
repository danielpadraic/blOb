import type { ChallengeProofPart } from '@/lib/challengeProofs';

export const CHECKIN_STATUSES = ['in_progress', 'ready', 'submitted'] as const;

export type CheckinStatus = (typeof CHECKIN_STATUSES)[number];

export type CheckinPhase = 'none' | CheckinStatus;

export type ChallengeCheckin = {
  id: string;
  user_id: string;
  challenge_id: string;
  period_key: string;
  status: CheckinStatus;
  proof_parts: Record<string, ChallengeProofPart>;
  pre_selfie_url?: string | null;
  post_selfie_url?: string | null;
  hr_monitor_url?: string | null;
  notes?: string | null;
  health_workout_id?: string | null;
  workout_submission_id?: string | null;
  started_at: string;
  submitted_at?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export function asCheckinStatus(value: unknown): CheckinStatus | null {
  if (value === 'in_progress' || value === 'ready' || value === 'submitted') {
    return value;
  }
  return null;
}

export function checkinCtaTitle(phase: CheckinPhase): string {
  if (phase === 'in_progress') {
    return 'Continue check-in';
  }
  if (phase === 'ready') {
    return 'Submit';
  }
  if (phase === 'submitted') {
    return 'Checked in';
  }
  return 'Begin check-in';
}

export function isCheckinPrimary(phase: CheckinPhase): boolean {
  return phase === 'none' || phase === 'in_progress' || phase === 'ready';
}
