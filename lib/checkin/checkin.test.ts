import { describe, expect, it } from 'vitest';

import { checkinCtaTitle } from '@/lib/challengeCheckin';
import {
  BEFORE_AFTER_HR_PRESET,
  checkinProofsReady,
  partSatisfies,
  parseProofParts,
  type ChallengeProof,
} from '@/lib/challengeProofs';
import {
  boardProgressLabel,
  checkinStageLabel,
  classifyCheckinError,
  didAdvanceBoard,
  incrementDaysCompleted,
} from '@/lib/checkin';

const officialTrio: ChallengeProof[] = BEFORE_AFTER_HR_PRESET.map((item, index) => ({
  id: `proof-${index + 1}`,
  name: item.name,
  method: item.method,
  minutes: item.minutes,
}));

describe('check-in stages', () => {
  it('uses Begin → Continue → Submit, never log', () => {
    expect(checkinCtaTitle('none')).toBe('Begin');
    expect(checkinCtaTitle('in_progress')).toBe('Continue');
    expect(checkinCtaTitle('ready')).toBe('Submit');
    expect(checkinCtaTitle('submitted')).toBe('Checked in');
    expect(checkinStageLabel('none')).toBe('Begin');
    expect(checkinStageLabel('ready')).toBe('Submit');
  });
});

describe('official weekly proofs', () => {
  it('needs pre-selfie, post-selfie, and heart-rate proof', () => {
    expect(officialTrio).toHaveLength(3);
    expect(officialTrio[0]?.method).toBe('photo');
    expect(officialTrio[1]?.method).toBe('photo');
    expect(officialTrio[2]?.method).toBe('hr');
    expect(checkinProofsReady(officialTrio, {})).toBe(false);
  });

  it('advances 0/N → 1/N only after every image is attached', () => {
    const target = 7;
    const before = 0;
    const empty = parseProofParts({});
    expect(checkinProofsReady(officialTrio, empty)).toBe(false);
    expect(boardProgressLabel(before, target)).toBe('0/7');

    const withImages = parseProofParts({
      'proof-1': { method: 'photo', url: 'https://example.com/pre.jpg' },
      'proof-2': { method: 'photo', url: 'https://example.com/post.jpg' },
      'proof-3': { method: 'hr', url: 'https://example.com/hr.jpg' },
    });
    expect(partSatisfies(officialTrio[0]!, withImages['proof-1'])).toBe(true);
    expect(partSatisfies(officialTrio[1]!, withImages['proof-2'])).toBe(true);
    expect(partSatisfies(officialTrio[2]!, withImages['proof-3'])).toBe(true);
    expect(checkinProofsReady(officialTrio, withImages)).toBe(true);

    const after = incrementDaysCompleted(before, false);
    expect(didAdvanceBoard(before, after)).toBe(true);
    expect(boardProgressLabel(after, target)).toBe('1/7');
  });

  it('blocks a second submit for the same window', () => {
    expect(incrementDaysCompleted(1, true)).toBe(1);
    expect(classifyCheckinError(new Error('ALREADY_LOGGED_TODAY'))).toBe('already');
  });
});
