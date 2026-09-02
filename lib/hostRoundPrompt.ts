import { asCopyTone, type CopyTone } from '@/lib/copy';
import { isChallengeLive } from '@/lib/challengeStart';
import { resolveChallengeTimezone } from '@/lib/challengeTimezone';
import { dateStampInZone } from '@/lib/officialDays';
import { authStorage } from '@/lib/utils/secureStore';

export const HOST_ROUND_PROMPT_MAX = 100;

export const HOST_ROUND_PROMPT_COPY = {
  gentle: 'Got 30 seconds for the room?',
  honest: 'They’re in it. Send a Round.',
} as const;

export type HostRoundPromptCopyTone = 'gentle' | 'honest';

export function asHostRoundPromptTone(value: unknown): HostRoundPromptCopyTone {
  return asCopyTone(value) === 'honest' ? 'honest' : 'gentle';
}

export function hostRoundPromptLine(tone?: CopyTone | string | null): string {
  const line = HOST_ROUND_PROMPT_COPY[asHostRoundPromptTone(tone)];
  return line.slice(0, HOST_ROUND_PROMPT_MAX);
}

export function challengeDayStamp(
  now: Date,
  timeZone?: string | null,
): string {
  return dateStampInZone(now, resolveChallengeTimezone(timeZone));
}

export function viewerLocalDayStamp(now: Date = new Date(), timeZone?: string | null): string {
  return dateStampInZone(now, resolveChallengeTimezone(timeZone));
}

export function reelOnChallengeDay(
  createdAt: string | null | undefined,
  timeZone: string | null | undefined,
  day: string,
): boolean {
  const then = createdAt ? new Date(createdAt) : null;
  if (!then || Number.isNaN(then.getTime())) {
    return false;
  }
  return dateStampInZone(then, resolveChallengeTimezone(timeZone)) === day;
}

export function isHostRoundPromptHost(input: {
  viewerId?: string | null;
  createdBy?: string | null;
}): boolean {
  return Boolean(input.viewerId && input.createdBy && input.viewerId === input.createdBy);
}

export function shouldShowHostRoundPrompt(input: {
  isHost: boolean;
  status?: string | null;
  postedRoundToday: boolean;
  dismissedLocalDay: boolean;
}): boolean {
  if (!input.isHost || !isChallengeLive(input.status)) {
    return false;
  }
  if (input.postedRoundToday || input.dismissedLocalDay) {
    return false;
  }
  return true;
}

function dismissKey(userId: string, challengeId: string, localDay: string): string {
  return `host-round-prompt:${userId}:${challengeId}:${localDay}`;
}

export async function readHostRoundPromptDismissed(
  userId: string,
  challengeId: string,
  localDay: string,
): Promise<boolean> {
  try {
    const raw = await authStorage.getItem(dismissKey(userId, challengeId, localDay));
    return raw === 'dismissed';
  } catch {
    return false;
  }
}

export async function writeHostRoundPromptDismissed(
  userId: string,
  challengeId: string,
  localDay: string,
): Promise<void> {
  try {
    await authStorage.setItem(dismissKey(userId, challengeId, localDay), 'dismissed');
  } catch {
    // Chip hide is local; next open can try again.
  }
}

export async function readHostRoundPromptPushed(
  userId: string,
  challengeId: string,
  localDay: string,
): Promise<boolean> {
  try {
    const raw = await authStorage.getItem(`${dismissKey(userId, challengeId, localDay)}:push`);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function writeHostRoundPromptPushed(
  userId: string,
  challengeId: string,
  localDay: string,
): Promise<void> {
  try {
    await authStorage.setItem(`${dismissKey(userId, challengeId, localDay)}:push`, '1');
  } catch {
    // In-app chip still shows.
  }
}

export function hostRoundCaptureHref(challengeId: string): string {
  return `/capture?mode=reel&media=video&challengeId=${encodeURIComponent(challengeId)}`;
}
