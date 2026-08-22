import { hasChallengeStarted } from '@/lib/settlement';

export const FIELD_NOTE_KEYS = ['pot', 'buyIn', 'board', 'share', 'startNeeded'] as const;

export type FieldNoteKey = (typeof FIELD_NOTE_KEYS)[number];

export const FIELD_NOTE_TITLE: Record<FieldNoteKey, 'note.potTitle' | 'note.buyInTitle' | 'note.boardTitle' | 'note.shareTitle' | 'note.startTitle'> = {
  pot: 'note.potTitle',
  buyIn: 'note.buyInTitle',
  board: 'note.boardTitle',
  share: 'note.shareTitle',
  startNeeded: 'note.startTitle',
};

export const FIELD_NOTE_BODY: Record<FieldNoteKey, 'note.pot' | 'note.buyIn' | 'note.board' | 'note.share' | 'note.startNeeded'> = {
  pot: 'note.pot',
  buyIn: 'note.buyIn',
  board: 'note.board',
  share: 'note.share',
  startNeeded: 'note.startNeeded',
};

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
