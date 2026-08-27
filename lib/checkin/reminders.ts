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
    8: [
      'Check in for {challenge} — stay in it.',
      '{challenge} is still open. Check in when you can.',
      'Window’s open on {challenge}. One check-in keeps you in.',
    ],
    4: [
      'Four hours on {challenge}. Check in and stay in it.',
      '{challenge}: four hours left. Check in.',
      'Four hours left on {challenge}. Check in.',
    ],
    2: [
      'Two hours on {challenge}. Check in — stay in it.',
      '{challenge}: two hours. Check in now.',
      'Last two hours on {challenge}. Check in.',
    ],
  },
  honest: {
    8: [
      'Check in for {challenge} or you are on the clock.',
      '{challenge} still needs a check-in. Do it today.',
      'Don’t ghost {challenge}. Check in while you can.',
    ],
    4: [
      'Four hours on {challenge}. Check in or lose your seat.',
      '{challenge}: four hours. Check in.',
      'Four hours left. Check in for {challenge}.',
    ],
    2: [
      'Two hours on {challenge}. Check in or you’re out.',
      '{challenge}: two hours. Check in now.',
      'Last two on {challenge}. Check in. No later.',
    ],
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
