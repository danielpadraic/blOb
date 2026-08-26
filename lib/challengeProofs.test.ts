import { describe, expect, it } from 'vitest';

import {
  defaultSentenceForMethod,
  methodLabel,
  partSatisfies,
  proofTypeFromMethod,
  signupProofLines,
} from '@/lib/challengeProofs';
import { SIMPLE_PROOF_METHODS } from '@/lib/simpleChallenge';

describe('signupProofLines', () => {
  it('does not duplicate Kids Chore proof lines from matching tasks', () => {
    const lines = signupProofLines({
      scoring_method: 'comparable_points',
      proofs: [
        { id: 'kitchen_before', name: 'Before photo of the kitchen chore', method: 'photo' },
        { id: 'kitchen_after', name: 'After photo of the kitchen chore', method: 'photo' },
        { id: 'laundry', name: 'Photo of completed laundry', method: 'photo' },
        { id: 'bible_reading', name: 'Screenshot of the completed Bible reading plan for the day', method: 'photo' },
      ],
      tasks: [
        { id: 'kitchen_chore', title: 'Kitchen Chore', proof_required: true, proof_types: ['photo'] },
        { id: 'laundry', title: 'Laundry', proof_required: true, proof_types: ['photo'] },
        { id: 'bible_reading', title: 'Bible Reading Plan + Discussion', proof_required: true, proof_types: ['photo'] },
      ],
    });
    expect(lines).toEqual([
      'Before photo of the kitchen chore.',
      'After photo of the kitchen chore.',
      'Photo of completed laundry.',
      'Screenshot of the completed Bible reading plan for the day.',
      'Extra photos or videos are welcome.',
    ]);
  });
});

describe('Note proof method', () => {
  it('labels Simple checkin as Note and needs written text', () => {
    expect(SIMPLE_PROOF_METHODS.some((item) => item.value === 'checkin' && item.label === 'Note')).toBe(true);
    expect(defaultSentenceForMethod('checkin')).toBe('Write a short note that you did the work.');
    expect(methodLabel('checkin')).toBe('Note');
    expect(proofTypeFromMethod('checkin')).toBe('check_in');
    expect(partSatisfies({ id: 'n', name: 'Note', method: 'checkin' }, { method: 'checkin', text: 'Done' })).toBe(
      true,
    );
    expect(
      partSatisfies({ id: 'n', name: 'Note', method: 'checkin' }, { method: 'checkin', url: 'https://x.test/n' }),
    ).toBe(false);
  });
});
