/** Bob check-in risk copy. Must stay in sync with `enqueue_checkin_reminders`. */

import { challengeDisplayTitle } from '@/lib/challengeTitle';

export const CHECKIN_RISK_OFFSETS = [8, 4, 2] as const;
export type CheckinRiskOffset = (typeof CHECKIN_RISK_OFFSETS)[number];
export type CheckinRiskTone = 'gentle' | 'honest';

export const CHECKIN_RISK_MAX_CHARS = 100;
export const CHECKIN_REMINDER_TYPE = 'challenge_checkin_reminder' as const;

/** Tokens: {challenge}. Gentle or Honest only. ≤100 after substitution. */
export const CHECKIN_RISK_COPY: Record<CheckinRiskTone, Record<CheckinRiskOffset, readonly string[]>> = {
  gentle: {
    8: ['Time to check in to {challenge}.'],
    4: ['4 hours left to check in to {challenge}.'],
    2: ['2 hours left to check in to {challenge}.'],
  },
  honest: {
    8: ['{challenge}: check in today.'],
    4: ['{challenge}: 4 hours. Check in or miss the day.'],
    2: ['{challenge}: 2 hours. Check in or miss the day.'],
  },
};

export function asCheckinRiskTone(value: unknown): CheckinRiskTone {
  return value === 'honest' ? 'honest' : 'gentle';
}

export function checkinReminderChallengeName(row: {
  title?: string | null;
  task?: string | null;
  tasks?: Array<{ title?: string | null } | string> | null;
} | null | undefined): string {
  return challengeDisplayTitle(row) || 'this challenge';
}

export function formatCheckinRiskLine(template: string, challengeName: string): string {
  const token = '{challenge}';
  const name = String(challengeName ?? '').trim() || 'this challenge';
  const overhead = Math.max(template.length - token.length, 0);
  const maxName = Math.max(CHECKIN_RISK_MAX_CHARS - overhead, 8);
  const label = name.length > maxName ? `${name.slice(0, Math.max(maxName - 1, 1))}…` : name;
  return template.split(token).join(label).slice(0, CHECKIN_RISK_MAX_CHARS);
}

export function checkinRiskDedupeKey(input: {
  userId: string;
  challengeId: string;
  periodKey: string;
  offsetHours: number;
}): string {
  return `${input.userId}:${input.challengeId}:${input.periodKey}:${input.offsetHours}`;
}

/** Overview for this id. Never submit or a camera route. */
export function checkinRiskHref(challengeId: string): string {
  return `/challenges/${challengeId}`;
}

export function isCheckinNudgeType(type: string | null | undefined): boolean {
  return (
    type === CHECKIN_REMINDER_TYPE ||
    type === 'health_begin' ||
    type === 'health_checkout'
  );
}

export function pickCheckinRiskCopy(
  offsetHours: CheckinRiskOffset,
  seed: string,
  challengeName: string,
  tone?: unknown,
): string {
  const lines = CHECKIN_RISK_COPY[asCheckinRiskTone(tone)][offsetHours];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % lines.length;
  return formatCheckinRiskLine(lines[index] ?? lines[0]!, challengeName);
}
