import { describe, expect, it } from 'vitest';

import {
  proofPartMediaUrls,
  unionCheckinAttachmentUrls,
  workoutOverlapsLiftWindow,
} from '@/lib/checkin/unionAttachments';

const SELFIE = 'https://cdn.test/selfie.jpg';
const RECAP = 'https://cdn.test/user/c/workout_card-9.jpg';
const LIFT = 'https://cdn.test/lift-card.jpg';

describe('unionCheckinAttachmentUrls', () => {
  it('orders stills, then recap, then extras, and never copies ""', () => {
    expect(
      unionCheckinAttachmentUrls({
        stills: [SELFIE, ''],
        recap: RECAP,
        extras: [LIFT],
      }),
    ).toEqual([SELFIE, RECAP, LIFT]);
  });

  it('does not replace a selfie with a later recap write', () => {
    expect(unionCheckinAttachmentUrls({ stills: [SELFIE], recap: RECAP })).toEqual([SELFIE, RECAP]);
    expect(unionCheckinAttachmentUrls({ stills: [RECAP], recap: RECAP })).toEqual([RECAP]);
  });
});

describe('proofPartMediaUrls', () => {
  it('keeps user stills and one recap', () => {
    expect(proofPartMediaUrls({ uploaded: [SELFIE, RECAP, RECAP], recap: RECAP })).toEqual([
      SELFIE,
      RECAP,
    ]);
  });
});

describe('workoutOverlapsLiftWindow', () => {
  it('matches the HealthKit uuid on the lift, or the overlapping window', () => {
    expect(
      workoutOverlapsLiftWindow({
        providerWorkoutId: 'hk-1',
        liftHealthkitUuid: 'hk-1',
      }),
    ).toBe(true);
    expect(
      workoutOverlapsLiftWindow({
        workoutStartedAt: '2026-09-22T12:00:00.000Z',
        workoutEndedAt: '2026-09-22T12:45:00.000Z',
        liftPerformedAt: '2026-09-22T12:05:00.000Z',
        liftCompletedAt: '2026-09-22T12:40:00.000Z',
      }),
    ).toBe(true);
    expect(
      workoutOverlapsLiftWindow({
        workoutStartedAt: '2026-09-22T08:00:00.000Z',
        workoutEndedAt: '2026-09-22T08:20:00.000Z',
        liftPerformedAt: '2026-09-22T12:00:00.000Z',
      }),
    ).toBe(false);
  });
});
