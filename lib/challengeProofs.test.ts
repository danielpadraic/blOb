import { describe, expect, it } from 'vitest';

import {
  defaultSentenceForMethod,
  guidedCheckinPrompt,
  guidedCheckinTitle,
  legacyTypeForProof,
  methodLabel,
  nextEmptyRequiredProof,
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

describe('guided check-in prompts', () => {
  const workout = [
    { id: 'pre', name: 'Post a pre-workout selfie.', method: 'photo' as const },
    { id: 'post', name: 'Post a post-workout selfie.', method: 'photo' as const },
    { id: 'hr', name: 'Share proof of at least 30 minutes of elevated heart rate.', method: 'hr' as const, minutes: 30 },
  ];

  it('titles the next empty workout slot and names the one after', () => {
    const empty = guidedCheckinPrompt(workout, () => false);
    expect(empty?.title).toBe('Take a Pre-Workout Selfie');
    expect(empty?.helper).toBe("Then you'll add a Post-Workout Selfie.");
    const afterPre = guidedCheckinPrompt(workout, (proof) => proof.id === 'pre');
    expect(afterPre?.title).toBe('Take a Post-Workout Selfie');
    expect(afterPre?.helper).toBe("Then you'll add Proof of 30-Min of Elevated Heart Rate.");
    const afterPost = guidedCheckinPrompt(workout, (proof) => proof.id === 'pre' || proof.id === 'post');
    expect(afterPost?.title).toBe('Upload Proof of 30-Min of Elevated Heart Rate');
    expect(afterPost?.helper).toBeNull();
    expect(nextEmptyRequiredProof(workout, (proof) => proof.id === 'pre')?.id).toBe('post');
  });

  it('does not put workout copy on honor, prayer, pages, or mileage', () => {
    expect(guidedCheckinTitle({ id: 'honor', name: 'Confirm on your honor that you did the work.', method: 'honor' })).toBe(
      'Confirm on your honor that you did the work',
    );
    expect(guidedCheckinTitle({ id: 'prayer', name: 'Morning prayer', method: 'photo' })).toBe('Take Morning prayer');
    expect(guidedCheckinTitle({ id: 'pages', name: "Log today's pages", method: 'photo' })).toBe("Log today's pages");
    expect(guidedCheckinTitle({ id: 'pages2', name: 'pages', method: 'photo' })).toBe("Log today's pages");
    expect(guidedCheckinTitle({ id: 'miles', name: 'Run 3 miles', method: 'distance' })).toBe('Log Run 3 miles');
    expect(guidedCheckinPrompt([{ id: 'honor', name: 'Honor', method: 'honor' }], () => true)).toBeNull();
  });

  it('does not relabel a checkout / post slot as pre-workout', () => {
    const post = { id: 'post', name: 'Check-out selfie', method: 'photo' as const };
    expect(guidedCheckinTitle(post)).toBe('Take a Post-Workout Selfie');
    expect(legacyTypeForProof(post)).toBe('post_selfie');
    expect(legacyTypeForProof({ id: 'pre', name: 'Pre-workout selfie', method: 'photo' })).toBe('pre_selfie');
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
