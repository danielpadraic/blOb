import { challengeTaskTitles } from '@/lib/challengeRuleCopy';
import {
  POST_WORKOUT_SELFIE_SENTENCE,
  PRE_WORKOUT_SELFIE_SENTENCE,
  WEEK_10_PROOF_SENTENCE,
  heartRateProofSentence,
} from '@/lib/challengeProofs';

export const CHECKIN_COMPLETE_BODY = 'Check-in Complete';

const SLOT_TITLE_CAPTIONS = new Set(
  [
    PRE_WORKOUT_SELFIE_SENTENCE,
    POST_WORKOUT_SELFIE_SENTENCE,
    WEEK_10_PROOF_SENTENCE,
    heartRateProofSentence(30),
    'How did it go?',
  ].map((line) => line.trim().toLowerCase()),
);

/** Stored body when the composer is empty. Never treat this as something they typed. */
export function isCheckinCompleteSentinel(text?: string | null): boolean {
  const normalized = String(text ?? '')
    .trim()
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ');
  return /^check\s*in\s*complete\.?$/i.test(normalized);
}

function isSlotTitleCaption(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower) {
    return false;
  }
  if (SLOT_TITLE_CAPTIONS.has(lower)) {
    return true;
  }
  return (
    /^post a (pre|post)-workout selfie\.?$/i.test(lower) ||
    /^share proof of at least \d+ minutes? of elevated heart rate\.?$/i.test(lower)
  );
}

/** Composer field: real caption only. Empty if they never typed one. */
export function checkinComposerPrefill(text?: string | null): string {
  const trimmed = String(text ?? '').trim();
  return !trimmed || isCheckinCompleteSentinel(trimmed) || isSlotTitleCaption(trimmed) ? '' : trimmed;
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
