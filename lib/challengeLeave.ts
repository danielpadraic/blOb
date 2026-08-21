import type { Challenge } from '@/lib/types';

const LEFT_STATUSES = new Set([
  'live',
  'judging',
  'settled',
  'cancelled',
  'cancelled_underfilled',
  'distributing',
]);

/** User-created, joined, not live. Official never shows Leave. */
export function canParticipantLeave(input: {
  challenge:
    | Pick<Challenge, 'status' | 'is_official' | 'series_id'>
    | null
    | undefined;
  joined?: boolean;
}): boolean {
  const challenge = input.challenge;
  if (!challenge || !input.joined) {
    return false;
  }
  if (challenge.is_official || challenge.series_id) {
    return false;
  }
  return !LEFT_STATUSES.has(String(challenge.status ?? ''));
}
