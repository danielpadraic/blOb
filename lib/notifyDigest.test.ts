import { describe, expect, it } from 'vitest';

import {
  checkinDigestDedupeKey,
  checkinDigestLine,
  collapseChallengeDigests,
  highFiveDraft,
  settleDedupeKey,
  winnerDigestLine,
} from '@/lib/notifyDigest';
import type { AppNotification } from '@/lib/types';

function note(partial: Partial<AppNotification> & Pick<AppNotification, 'id' | 'type' | 'title'>): AppNotification {
  return {
    user_id: 'me',
    actor_id: null,
    body: null,
    data: {},
    read_at: null,
    created_at: '2026-08-29T18:00:00.000Z',
    ...partial,
  };
}

describe('winnerDigestLine', () => {
  it('lists you + one friend', () => {
    expect(
      winnerDigestLine({
        challengeTitle: 'Morning miles',
        friendNames: ['Alex'],
        viewerFinished: true,
      }),
    ).toBe('Nice work! You and Alex all won Morning miles! Send a high-five!');
  });

  it('lists two or three friends', () => {
    expect(
      winnerDigestLine({
        challengeTitle: 'Morning miles',
        friendNames: ['Alex', 'Sam'],
        viewerFinished: true,
      }),
    ).toBe('Nice work! You, Alex, and Sam all won Morning miles! Send a high-five!');
    expect(
      winnerDigestLine({
        challengeTitle: 'Morning miles',
        friendNames: ['Alex', 'Sam', 'Jo'],
        viewerFinished: true,
      }),
    ).toBe('Nice work! You, Alex, Sam, and Jo all won Morning miles! Send a high-five!');
  });

  it('caps four or more at two names plus others', () => {
    expect(
      winnerDigestLine({
        challengeTitle: 'Morning miles',
        friendNames: ['Alex', 'Sam', 'Jo', 'Pat'],
        viewerFinished: true,
      }),
    ).toBe('Nice work! You, Alex, Sam, and 2 others all won Morning miles! Send a high-five!');
  });

  it('uses a personal row when you finished alone', () => {
    expect(
      winnerDigestLine({
        challengeTitle: 'Morning miles',
        friendNames: [],
        viewerFinished: true,
      }),
    ).toBe('Nice work! You finished Morning miles.');
  });

  it('never says you won when you did not finish', () => {
    expect(
      winnerDigestLine({
        challengeTitle: 'Morning miles',
        friendNames: ['Alex', 'Sam', 'Jo'],
        viewerFinished: false,
      }),
    ).toBe('Alex, Sam, and Jo won Morning miles.');
    expect(
      winnerDigestLine({
        challengeTitle: 'Morning miles',
        friendNames: [],
        viewerFinished: false,
      }),
    ).toBe('Morning miles ended.');
  });
});

describe('checkinDigestLine', () => {
  it('keeps the one-person congratulate line', () => {
    expect(
      checkinDigestLine({
        challengeTitle: 'Morning miles',
        count: 1,
        name: 'Alex',
        pronoun: 'her',
      }),
    ).toBe('Alex Check-In @Morning miles. Congratulate her.');
  });

  it('collapses two or more into one friends line', () => {
    expect(
      checkinDigestLine({
        challengeTitle: 'Morning miles',
        count: 2,
      }),
    ).toBe('2 friends checked in on Morning miles.');
  });
});

describe('digest keys', () => {
  it('dedupes settle per viewer + challenge', () => {
    expect(settleDedupeKey('c1', 'u1')).toBe('settle:c1:u1');
  });

  it('dedupes check-in per viewer + challenge + period', () => {
    expect(checkinDigestDedupeKey('c1', 'u1', '2026-08-29')).toBe(
      'checkin-digest:c1:u1:2026-08-29',
    );
  });

  it('prefills a short congrats, and does not send it', () => {
    expect(highFiveDraft('Morning miles')).toBe('High five — we all finished Morning miles!');
  });
});

describe('collapseChallengeDigests', () => {
  it('keeps one settle row and drops leftover payout/won/placed', () => {
    const rows = collapseChallengeDigests([
      note({
        id: 'payout',
        type: 'payout_received',
        title: 'You received 4 from @Morning miles.',
        data: { challenge_id: 'c1', amount: 4 },
      }),
      note({
        id: 'won',
        type: 'challenge_won',
        title: 'You won',
        data: { challenge_id: 'c1' },
      }),
      note({
        id: 'digest',
        type: 'challenge_settled',
        title: 'Nice work! You, Alex, Sam, and Jo all won Morning miles! Send a high-five!',
        data: {
          challenge_id: 'c1',
          high_five: true,
          winner_ids: ['a', 's', 'j'],
          challenge_title: 'Morning miles',
        },
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('challenge_settled');
    expect(rows[0].data.high_five).toBe(true);
    expect(rows[0].data.amount).toBe(4);
  });

  it('collapses two friend check-ins on the same day into one digest', () => {
    const rows = collapseChallengeDigests([
      note({
        id: 'one',
        type: 'challenge_checkin',
        title: 'Alex Check-In @Morning miles. Congratulate her.',
        actor_id: 'alex',
        data: {
          challenge_id: 'c1',
          period_key: '2026-08-29',
          challenge_title: 'Morning miles',
          actor_ids: ['alex'],
        },
      }),
      note({
        id: 'two',
        type: 'challenge_checkin',
        title: 'Sam Check-In @Morning miles. Congratulate him.',
        actor_id: 'sam',
        data: {
          challenge_id: 'c1',
          period_key: '2026-08-29',
          challenge_title: 'Morning miles',
          actor_ids: ['sam'],
        },
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('2 friends checked in on Morning miles.');
    expect(rows[0].data.count).toBe(2);
  });
});
