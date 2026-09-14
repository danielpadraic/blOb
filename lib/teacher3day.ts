import { officialDobStatus } from '@/lib/officialDob';
import { parseUspsRegion } from '@/lib/geo/regions';
import { parseCheckinHealthProof, type CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { OFFICIAL_BOB_ID } from '@/lib/official';
import type { ChallengeProofPart } from '@/lib/challengeProofs';

export const TEACHER_3DAY_TITLE = '3-Day Consistency';
export const TEACHER_CREDIT_CENTS = 1000;

export type TeacherHrSource = 'health' | 'upload';
export type TeacherBannerPhase = 'none' | 'live' | 'missed' | 'done';

export type Teacher3DayState = {
  phase: TeacherBannerPhase;
  challengeId: string | null;
  dayN: number;
  completedDays: number;
  beganAt: string | null;
  endsAt: string | null;
  creditGranted: boolean;
  creditCents: number | null;
};

export type TeacherAccountGaps = {
  dob: boolean;
  underage: boolean;
  region: boolean;
  phone: boolean;
};

export function isTeacher3DayChallenge(challenge?: {
  is_teacher_3day?: boolean | null;
  teacher_kind?: string | null;
  title?: string | null;
} | null): boolean {
  if (!challenge) {
    return false;
  }
  if (challenge.is_teacher_3day) {
    return true;
  }
  return challenge.teacher_kind === 'instance' || challenge.teacher_kind === 'template';
}

export function teacherPhoneDigits(value?: string | null): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function teacherPhoneOk(value?: string | null): boolean {
  return teacherPhoneDigits(value).length >= 10;
}

export function teacherAccountGaps(profile?: {
  date_of_birth?: string | null;
  declared_region?: string | null;
  home_state?: string | null;
  phone?: string | null;
} | null): TeacherAccountGaps {
  const dob = officialDobStatus(profile?.date_of_birth);
  return {
    dob: dob === 'dob_required',
    underage: dob === 'underage',
    region: !parseUspsRegion(profile?.declared_region ?? profile?.home_state),
    phone: !teacherPhoneOk(profile?.phone),
  };
}

export function teacherAccountReady(profile?: {
  date_of_birth?: string | null;
  declared_region?: string | null;
  home_state?: string | null;
  phone?: string | null;
} | null): boolean {
  const gaps = teacherAccountGaps(profile);
  return !gaps.dob && !gaps.underage && !gaps.region && !gaps.phone;
}

export function teacherPrepReady(profile?: {
  teacher_camera_ready_at?: string | null;
  teacher_hr_source?: string | null;
} | null): boolean {
  return Boolean(profile?.teacher_camera_ready_at) && isTeacherHrSource(profile?.teacher_hr_source);
}

export function isTeacherHrSource(value?: string | null): value is TeacherHrSource {
  return value === 'health' || value === 'upload';
}

export function teacherCanBegin(profile?: {
  date_of_birth?: string | null;
  declared_region?: string | null;
  home_state?: string | null;
  phone?: string | null;
  teacher_camera_ready_at?: string | null;
  teacher_hr_source?: string | null;
} | null): boolean {
  return teacherAccountReady(profile) && teacherPrepReady(profile);
}

export function emptyTeacher3DayState(): Teacher3DayState {
  return {
    phase: 'none',
    challengeId: null,
    dayN: 1,
    completedDays: 0,
    beganAt: null,
    endsAt: null,
    creditGranted: false,
    creditCents: null,
  };
}

export function parseTeacher3DayState(raw: unknown): Teacher3DayState {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const phase = row.phase;
  return {
    phase: phase === 'live' || phase === 'missed' || phase === 'done' ? phase : 'none',
    challengeId: typeof row.challenge_id === 'string' && row.challenge_id.trim() ? row.challenge_id : null,
    dayN: clampTeacherDay(row.day_n),
    completedDays: Math.min(3, Math.max(0, Math.floor(Number(row.completed_days) || 0))),
    beganAt: typeof row.began_at === 'string' ? row.began_at : null,
    endsAt: typeof row.ends_at === 'string' ? row.ends_at : null,
    creditGranted: row.credit_granted === true,
    creditCents:
      row.credit_cents == null ? (row.credit_granted === true ? TEACHER_CREDIT_CENTS : null) : Number(row.credit_cents),
  };
}

function clampTeacherDay(value: unknown): number {
  const n = Math.floor(Number(value) || 1);
  return n < 1 ? 1 : n > 3 ? 3 : n;
}

export function teacherBannerTitle(state: Teacher3DayState): string {
  if (state.phase === 'live') {
    return `Day ${state.dayN} of 3`;
  }
  if (state.phase === 'missed') {
    return '3-Day vs you';
  }
  if (state.phase === 'done') {
    return '3-Day done';
  }
  return '3-Day vs you';
}

export function teacherBannerCta(state: Teacher3DayState): string {
  if (state.phase === 'live') {
    return 'Check In';
  }
  if (state.phase === 'missed') {
    return 'Start over';
  }
  if (state.phase === 'done') {
    return 'Next';
  }
  return 'Begin';
}

export function teacherBannerHelper(state: Teacher3DayState, underage: boolean): string | null {
  if (underage) {
    return 'Official Challenges are for 18 and up.';
  }
  if (state.phase === 'done') {
    return null;
  }
  if (state.phase === 'missed') {
    return 'Missed a required day.';
  }
  return null;
}

export function teacherPeriodWindows(
  beganAt: string | Date,
  now = new Date(),
): Array<{ day: number; startsAt: Date; endsAt: Date; current: boolean }> {
  const start = beganAt instanceof Date ? beganAt : new Date(beganAt);
  if (Number.isNaN(start.getTime())) {
    return [];
  }
  const dayMs = 24 * 60 * 60 * 1000;
  return [1, 2, 3].map((day) => {
    const startsAt = new Date(start.getTime() + (day - 1) * dayMs);
    const endsAt = new Date(startsAt.getTime() + dayMs);
    return {
      day,
      startsAt,
      endsAt,
      current: now.getTime() >= startsAt.getTime() && now.getTime() < endsAt.getTime(),
    };
  });
}

function looksLikeWeeklyRings(health?: CheckinHealthProof | null): boolean {
  if (!health) {
    return false;
  }
  const blob = `${health.sourceName} ${health.activityType}`.toLowerCase();
  return /ring|rings|move ring|exercise ring|stand ring|weekly/.test(blob);
}

export function teacherHrProofAccepts(part?: ChallengeProofPart | null): boolean {
  if (!part) {
    return false;
  }
  const hasFile = Boolean(part.url?.trim()) || Boolean(part.healthWorkoutId?.trim());
  const health = part.health ?? parseCheckinHealthProof(part.health);
  if (!health) {
    return hasFile;
  }
  if (looksLikeWeeklyRings(health)) {
    return false;
  }
  const hasClock = Boolean(health.startedAt || health.endedAt);
  const hasHr = Boolean((health.avgHrBpm ?? 0) > 0 || (health.hrSeries && health.hrSeries.length > 0));
  const caloriesOnly = Boolean((health.activeEnergyKcal ?? 0) > 0 || (health.totalEnergyKcal ?? 0) > 0);
  if (caloriesOnly && !hasHr) {
    return false;
  }
  if (hasHr && !hasClock) {
    return false;
  }
  return hasClock && hasHr;
}

export function teacherLiveAllowsAuthor(
  authorId?: string | null,
  viewerId?: string | null,
  officialId: string = OFFICIAL_BOB_ID,
): boolean {
  const author = String(authorId ?? '');
  if (!author) {
    return false;
  }
  if (author === officialId) {
    return true;
  }
  return Boolean(viewerId) && author === viewerId;
}

export const TEACHER_HR_HELPER = 'Needs date, time, and graph or average.';
export const TEACHER_SAMPLE_BODY = 'Date and time + graph or average heart rate.';
export const TEACHER_PRIZE_CHIP = 'Challenge prize unlocked. First Official next.';
