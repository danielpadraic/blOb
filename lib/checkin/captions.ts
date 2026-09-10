import { challengeTaskTitles } from '@/lib/challengeRuleCopy';

export const CHECKIN_COMPLETE_BODY = 'Check-in Complete';

/** Stored body when the composer is empty. Never treat this as something they typed. */
export function isCheckinCompleteSentinel(text?: string | null): boolean {
  const normalized = String(text ?? '')
    .trim()
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ');
  return /^check\s*in\s*complete\.?$/i.test(normalized);
}

/** Composer field: real caption only. Empty if they never typed one. */
export function checkinComposerPrefill(text?: string | null): string {
  const trimmed = String(text ?? '').trim();
  return !trimmed || isCheckinCompleteSentinel(trimmed) ? '' : trimmed;
}

/** Feed post body: the share field, or Check-in Complete when that field is empty. */
export function checkinPostBody(userCaption?: string | null): string {
  const trimmed = checkinComposerPrefill(userCaption);
  return trimmed || CHECKIN_COMPLETE_BODY;
}

export function checkinTaskLabel(challenge: {
  task?: string | null;
  tasks?: unknown[] | null;
  title?: string | null;
} | null | undefined): string {
  const titles = challengeTaskTitles({
    task: challenge?.task ?? null,
    tasks: challenge?.tasks ?? null,
  });
  const first = titles[0]?.trim();
  if (first) {
    return first;
  }
  return 'checking in';
}
