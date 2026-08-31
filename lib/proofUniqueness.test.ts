import { describe, expect, it } from 'vitest';

import { canSendCheckin } from '@/lib/checkin/stages';
import { checkinProofsReady, parseProofParts, type ChallengeProof } from '@/lib/challengeProofs';
import { incrementDaysCompleted } from '@/lib/checkin/progress';
import { isCheckinPost } from '@/lib/checkinPost';
import {
  parseProofAlreadyCountsError,
  proofAlreadyCountsCopy,
  proofObjectKey,
  proofReuseBlocked,
  proofUniquenessFamily,
  scoreAfterHideFromHome,
} from '@/lib/proofUniqueness';

const photo: ChallengeProof = { id: 'pre', name: 'Selfie', method: 'photo' };
const post: ChallengeProof = { id: 'post', name: 'Post selfie', method: 'photo' };

describe('proof uniqueness family', () => {
  it('blocks the same photo on two weeklies', () => {
    expect(proofUniquenessFamily({ frequency: 'weekly', duration_days: 7 })).toBe('weekly');
    expect(proofUniquenessFamily({ series_id: 'week_10', duration_days: 7 })).toBe('weekly');
    expect(
      proofReuseBlocked({
        family: 'weekly',
        otherFamily: 'weekly',
        sameProof: true,
      }),
    ).toBe(true);
  });

  it('allows the same photo on one weekly and one monthly', () => {
    expect(proofUniquenessFamily({ frequency: 'monthly', duration_days: 30 })).toBe('monthly');
    expect(proofUniquenessFamily({ series_id: 'month_30', duration_days: 30 })).toBe('monthly');
    expect(
      proofReuseBlocked({
        family: 'weekly',
        otherFamily: 'monthly',
        sameProof: true,
      }),
    ).toBe(false);
  });

  it('treats the same storage object as one proof even with query tokens', () => {
    const a = proofObjectKey(
      'https://ex.supabase.co/storage/v1/object/public/challenge-proofs/u1/a.jpg?token=1',
    );
    const b = proofObjectKey(
      'https://ex.supabase.co/storage/v1/object/public/challenge-proofs/u1/a.jpg',
    );
    expect(a).toBe('challenge-proofs/u1/a.jpg');
    expect(a).toBe(b);
  });

  it('writes a one-line composer error and keeps Send enabled after a different file', () => {
    expect(proofAlreadyCountsCopy('Official Weekly')).toBe(
      'That proof already counts on Official Weekly.',
    );
    expect(parseProofAlreadyCountsError(new Error('PROOF_ALREADY_COUNTS:Daily Prayer'))).toBe(
      'That proof already counts on Daily Prayer.',
    );
    expect(canSendCheckin(false, true, 'in_progress', false)).toBe(true);
  });
});

describe('hidden_from_home vs score', () => {
  it('does not drop days_completed or points', () => {
    expect(scoreAfterHideFromHome({ days: 4, points: 4 })).toEqual({ days: 4, points: 4 });
    expect(
      isCheckinPost({
        checkin_id: 'ck-1',
        source: 'checkin',
        hidden_from_home: true,
      } as { checkin_id: string; source: string; hidden_from_home: boolean }),
    ).toBe(true);
    expect(incrementDaysCompleted(4, false)).toBe(5);
  });
});

describe('incremental check-in', () => {
  it('appends the second required proof and only then marks complete', () => {
    const proofs = [photo, post];
    const first = parseProofParts({ pre: { method: 'photo', url: 'https://ex.com/pre.jpg' } });
    expect(canSendCheckin(false, true, 'in_progress', false)).toBe(true);
    expect(checkinProofsReady(proofs, first)).toBe(false);
    expect(incrementDaysCompleted(0, true)).toBe(0);

    const both = parseProofParts({
      pre: { method: 'photo', url: 'https://ex.com/pre.jpg' },
      post: { method: 'photo', url: 'https://ex.com/post.jpg' },
    });
    expect(checkinProofsReady(proofs, both)).toBe(true);
    expect(incrementDaysCompleted(0, false)).toBe(1);
  });
});
