import { isBucksChallenge, isFreeEntry } from '@/lib/currency';
import { hasChallengeStarted } from '@/lib/settlement';

export const FIELD_NOTE_KEYS = ['pot', 'potHost', 'buyIn', 'buyInFree', 'board', 'share', 'startNeeded'] as const;

export type FieldNoteKey = (typeof FIELD_NOTE_KEYS)[number];

export const FIELD_NOTE_TITLE: Record<
  FieldNoteKey,
  'note.potTitle' | 'note.potHostTitle' | 'note.buyInTitle' | 'note.buyInFreeTitle' | 'note.boardTitle' | 'note.shareTitle' | 'note.startTitle'
> = {
  pot: 'note.potTitle',
  potHost: 'note.potHostTitle',
  buyIn: 'note.buyInTitle',
  buyInFree: 'note.buyInFreeTitle',
  board: 'note.boardTitle',
  share: 'note.shareTitle',
  startNeeded: 'note.startTitle',
};

export const FIELD_NOTE_BODY: Record<
  FieldNoteKey,
  'note.pot' | 'note.potHost' | 'note.buyIn' | 'note.buyInFree' | 'note.board' | 'note.share' | 'note.startNeeded'
> = {
  pot: 'note.pot',
  potHost: 'note.potHost',
  buyIn: 'note.buyIn',
  buyInFree: 'note.buyInFree',
  board: 'note.board',
  share: 'note.share',
  startNeeded: 'note.startNeeded',
};

export function prizeFieldNote(challenge: {
  host_funded?: boolean | null;
  buy_in_amount?: number | null;
  currency?: string | null;
}): FieldNoteKey {
  if (challenge.host_funded || (isBucksChallenge(challenge) && isFreeEntry(challenge.buy_in_amount))) {
    return 'potHost';
  }
  return 'pot';
}

export function entryFieldNote(challenge: { buy_in_amount?: number | null }): FieldNoteKey {
  return isFreeEntry(challenge.buy_in_amount) ? 'buyInFree' : 'buyIn';
}

const STARTED_STATUSES = new Set(['live', 'judging', 'settled', 'cancelled', 'cancelled_underfilled']);

/** User-created min-to-start. Never Official 1.5×. Hidden once the challenge has started. */
export function userStartNeededLabel(
  challenge: {
    is_official?: boolean | null;
    min_participants?: number | null;
    participant_count?: number | null;
    status?: string | null;
    starts_at?: string | null;
    official_started_at?: string | null;
  },
  liveCompetitorCount?: number | null,
): string | null {
  if (challenge.is_official) {
    return null;
  }
  if (STARTED_STATUSES.has(String(challenge.status ?? '')) || hasChallengeStarted(challenge)) {
    return null;
  }
  const min = Math.max(Math.floor(Number(challenge.min_participants) || 0), 0);
  if (min <= 1) {
    return null;
  }
  const rosterCount = Number(liveCompetitorCount);
  const joined = Math.max(
    Math.floor(
      liveCompetitorCount != null && Number.isFinite(rosterCount)
        ? rosterCount
        : Number(challenge.participant_count) || 0,
    ),
    0,
  );
  const left = min - joined;
  if (left <= 0) {
    return null;
  }
  if (left === 1) {
    return '1 more person needed';
  }
  return `${left} more people needed`;
}
