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
  scoring_version?: number | null;
  distance_meters?: number | null;
  route_preview_url?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export function asCheckinStatus(value: unknown): CheckinStatus | null {
  if (value === 'in_progress' || value === 'ready' || value === 'submitted') {
    return value;
  }
  return null;
}

export function isSubmittedCheckin(row?: {
  status?: string | null;
  submitted_at?: string | null;
} | null): boolean {
  if (!row) {
    return false;
  }
  return row.status === 'submitted' || Boolean(row.submitted_at);
}

export function checkinCtaTitle(phase: CheckinPhase): string {
  if (phase === 'submitted') {
    return 'Checked in';
  }
  if (phase === 'ready') {
    return 'Submit';
  }
  if (phase === 'in_progress') {
    return 'Continue';
  }
  return 'Begin';
}

export function isCheckinPrimary(phase: CheckinPhase): boolean {
  return phase === 'none' || phase === 'in_progress' || phase === 'ready';
}
