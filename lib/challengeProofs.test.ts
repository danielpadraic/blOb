import { describe, expect, it } from 'vitest';

import { signupProofLines } from '@/lib/challengeProofs';

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
