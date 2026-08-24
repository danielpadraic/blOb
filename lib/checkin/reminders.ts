/** Bob check-in risk copy. Must stay in sync with `enqueue_checkin_reminders`. */

export const CHECKIN_RISK_OFFSETS = [8, 4, 2] as const;
export type CheckinRiskOffset = (typeof CHECKIN_RISK_OFFSETS)[number];

export const CHECKIN_RISK_MAX_CHARS = 100;
export const CHECKIN_REMINDER_TYPE = 'challenge_checkin_reminder' as const;

export const CHECKIN_RISK_COPY: Record<CheckinRiskOffset, readonly string[]> = {
  8: [
    'Hey — check-in window’s closing later. One post keeps you in the game.',
    'Still time. Check in later and you stay on the board.',
    'Window’s open. One check-in keeps your seat.',
  ],
  4: [
    'Four hours left to check in. Future you wants to stay on the board.',
    'Four hours. Check in and you keep your spot.',
    'Four hours on the clock. One check-in keeps you in it.',
  ],
  2: [
    'Two hours. Check in now or you’re out. You’ve got this.',
    'Two hours left. Check in and you stay in it.',
    'Last two hours. One check-in. You’ve got this.',
  ],
};

export function checkinRiskDedupeKey(input: {
  userId: string;
  challengeId: string;
  periodKey: string;
  offsetHours: number;
}): string {
  return `${input.userId}:${input.challengeId}:${input.periodKey}:${input.offsetHours}`;
}

export function checkinRiskHref(challengeId: string): string {
  return `/challenges/${challengeId}/submit`;
}

export function pickCheckinRiskCopy(offsetHours: CheckinRiskOffset, seed: string): string {
  const lines = CHECKIN_RISK_COPY[offsetHours];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % lines.length;
  return lines[index] ?? lines[0]!;
}
