import { describe, expect, it } from 'vitest';

import {
  defaultSentenceForMethod,
  methodLabel,
  partSatisfies,
  proofSlotNeedsRewrite,
  proofTypeFromMethod,
  signupProofLines,
  uniqueProofUrls,
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

describe('Distance proof method', () => {
  it('labels Distance and needs meters, not a photo', () => {
    expect(SIMPLE_PROOF_METHODS.some((item) => item.value === 'distance' && item.label === 'Distance')).toBe(
      true,
    );
    expect(defaultSentenceForMethod('distance')).toBe('Attach a run or walk of at least 1.00 miles.');
    expect(methodLabel('distance')).toBe('Distance');
    expect(proofTypeFromMethod('distance')).toBe('distance');
    expect(
      partSatisfies(
        { id: 'd', name: 'Distance', method: 'distance', distance_meters: 1609 },
        { method: 'distance', url: 'https://x.test/shot.jpg' },
      ),
    ).toBe(false);
    expect(
      partSatisfies(
        { id: 'd', name: 'Distance', method: 'distance', distance_meters: 1609 },
        { method: 'distance', distanceMeters: 1609 },
      ),
    ).toBe(true);
    expect(
      partSatisfies(
        { id: 'd', name: 'Distance', method: 'distance', distance_meters: 1609 },
        { method: 'distance', text: '1.00' },
      ),
    ).toBe(true);
    expect(
      partSatisfies(
        { id: 'd', name: 'Distance', method: 'distance', distance_meters: 1609 },
        { method: 'distance', health: { distanceMeters: 998 } as never },
      ),
    ).toBe(false);
  });

  it('accepts any session distance over zero on consistency logs', () => {
    expect(
      partSatisfies(
        { id: 'd', name: 'Distance', method: 'distance', distance_meters: 4828 },
        { method: 'distance', distanceMeters: 644 },
        { sessionDistance: true },
      ),
    ).toBe(true);
    expect(
      partSatisfies(
        { id: 'd', name: 'Distance', method: 'distance', distance_meters: 4828 },
        { method: 'distance', text: '12.0' },
        { sessionDistance: true },
      ),
    ).toBe(true);
    expect(
      partSatisfies(
        { id: 'd', name: 'Distance', method: 'distance', distance_meters: 4828 },
        { method: 'distance', text: '0' },
        { sessionDistance: true },
      ),
    ).toBe(false);
  });
});

describe('Location proof method', () => {
  it('labels Location and needs an in-fence check-in', () => {
    expect(SIMPLE_PROOF_METHODS.some((item) => item.value === 'location' && item.label === 'Location')).toBe(
      true,
    );
    expect(defaultSentenceForMethod('location')).toBe('Check in at the pinned place.');
    expect(methodLabel('location')).toBe('Location');
    expect(proofTypeFromMethod('location')).toBe('location');
    expect(
      partSatisfies({ id: 'l', name: 'Location', method: 'location' }, { method: 'location', in_fence: true }),
    ).toBe(true);
    expect(
      partSatisfies({ id: 'l', name: 'Location', method: 'location' }, { method: 'location', in_fence: false }),
    ).toBe(false);
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

describe('proof slot rewrite', () => {
  it('drops duplicate urls that only differ by query tokens', () => {
    expect(
      uniqueProofUrls([
        'https://cdn.example/a.jpg?token=1',
        'https://cdn.example/a.jpg?token=2',
        'https://cdn.example/b.jpg',
      ]),
    ).toEqual(['https://cdn.example/a.jpg?token=1', 'https://cdn.example/b.jpg']);
  });

  it('rewrites a slot when the draft is a new local file', () => {
    expect(proofSlotNeedsRewrite('file:///tmp/retake.jpg', 'https://cdn.example/old.jpg')).toBe(true);
    expect(proofSlotNeedsRewrite('https://cdn.example/old.jpg', 'https://cdn.example/old.jpg')).toBe(false);
  });
});
