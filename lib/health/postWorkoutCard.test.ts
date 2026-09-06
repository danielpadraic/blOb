import { describe, expect, it } from 'vitest';
import type { CheckinProofStats } from '@/lib/checkin/proofStats';
import type { CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import {
  isWorkoutCardUrl,
  workoutCardForPost,
  workoutFromPostStats,
  workoutSlideForPost,
} from '@/lib/health/postWorkoutCard';
import type { WorkoutRoute } from '@/lib/health/route';

/** Daniel's Sep 5 Outdoor Walk as `posts.checkin_stats` stores it: 10042 m is 6.24 mi. */
const WALK_STATS: CheckinProofStats = {
  activity: 'walking',
  duration_sec: 8617,
  active_cal: 672,
  hr_min: 81,
  hr_avg: 103,
  hr_max: 112,
  distance_m: 10042,
};

/** The same walk as the participant-only snapshot stores it, with its real window. */
const WALK_SNAPSHOT: CheckinHealthProof = {
  source: 'healthkit',
  startedAt: '2026-09-05T20:01:00.000Z',
  endedAt: '2026-09-05T22:24:37.000Z',
  durationSec: 8617,
  activityType: 'walking',
  sourceName: 'Daniel’s Apple Watch',
  avgHrBpm: 103,
  maxHrBpm: 112,
  minHrBpm: 81,
  activeEnergyKcal: 672,
  distanceMeters: 10042,
};

const ROUTE: WorkoutRoute = {
  kind: 'gps',
  activity: 'walk',
  pointCount: 4,
  polyline: [
    { lat: 40.65, lng: -111.9 },
    { lat: 40.66, lng: -111.91 },
    { lat: 40.67, lng: -111.9 },
    { lat: 40.66, lng: -111.89 },
  ],
  bounds: { minLat: 40.65, minLng: -111.91, maxLat: 40.67, maxLng: -111.89 },
  start: { lat: 40.65, lng: -111.9 },
  end: { lat: 40.66, lng: -111.89 },
};

describe('the workout a post rebuilds from its own stats', () => {
  it('carries the miles the row stores, which is what the baked card got wrong', () => {
    expect(workoutFromPostStats(WALK_STATS)?.distanceM).toBe(10042);
  });

  it('reads calories, all three heart rates and the elapsed time', () => {
    const workout = workoutFromPostStats(WALK_STATS);
    expect(workout).toMatchObject({
      durationSec: 8617,
      caloriesKcal: 672,
      hrMin: 81,
      hrAvg: 103,
      hrMax: 112,
      activityType: 'walking',
      activityLabel: 'Walking',
    });
  });

  it('leaves the window empty rather than dating the workout from the post', () => {
    const workout = workoutFromPostStats(WALK_STATS);
    expect(workout?.startedAt).toBe('');
    expect(workout?.endedAt).toBe('');
  });

  it('falls back to total calories when only those were stored', () => {
    expect(workoutFromPostStats({ ...WALK_STATS, active_cal: null, total_cal: 810 })?.caloriesKcal).toBe(810);
  });

  it('still builds a workout for indoor work that covered no ground', () => {
    const workout = workoutFromPostStats({ activity: 'other', duration_sec: 3002, hr_avg: 137 });
    expect(workout?.durationSec).toBe(3002);
    expect(workout?.distanceM).toBeUndefined();
  });

  it('refuses an honor check-in, which has no headline to lead with', () => {
    expect(workoutFromPostStats({ pronoun: 'he' })).toBeNull();
    expect(workoutFromPostStats(null)).toBeNull();
  });
});

describe('the card a posted check-in draws', () => {
  it('prints 6.24 mi from the stats alone, with no snapshot and no picture', () => {
    const card = workoutCardForPost({
      stats: WALK_STATS,
      challengeTitle: '30-Day Consistency',
      timeZone: 'America/Denver',
    });
    expect(card?.headline).toEqual({ value: '6.24 mi', label: 'Distance' });
    expect(card?.distanceLine).toBe('6.24 mi');
  });

  it('omits the date and time range a viewer outside the challenge cannot know', () => {
    const card = workoutCardForPost({
      stats: WALK_STATS,
      challengeTitle: '30-Day Consistency',
      timeZone: 'America/Denver',
    });
    expect(card?.dateLine).toBe('');
    expect(card?.timeRange).toBe('');
    expect(card?.route).toBeNull();
  });

  it('prefers the snapshot, which knows the real clock and the track', () => {
    const card = workoutCardForPost({
      stats: WALK_STATS,
      health: { ...WALK_SNAPSHOT, route: ROUTE },
      challengeTitle: '30-Day Consistency',
      timeZone: 'America/Denver',
    });
    expect(card?.dateLine).toBe('Saturday, September 5, 2026');
    expect(card?.timeRange).toBe('2:01 – 4:24 PM');
    expect(card?.route?.pointCount).toBe(4);
    expect(card?.distanceLine).toBe('6.24 mi');
    expect(card?.sourceLine).toBe('Recorded on Apple Watch');
  });

  it('never draws a map from post stats, so no viewer gets an empty frame', () => {
    const card = workoutCardForPost({
      stats: WALK_STATS,
      health: null,
      challengeTitle: '30-Day Consistency',
      timeZone: 'America/Denver',
    });
    expect(card?.route).toBeNull();
  });

  it('does not claim the workout had no heart rate when the average is right there', () => {
    const card = workoutCardForPost({
      stats: WALK_STATS,
      challengeTitle: '30-Day Consistency',
      timeZone: 'America/Denver',
    });
    expect(card?.heartRate.emptyLine).toBeNull();
    expect(card?.heartRate.avgLine).toBe('103 BPM AVG');
  });

  it('reads as check-in proof when the post does not name a challenge', () => {
    const card = workoutCardForPost({ stats: WALK_STATS, timeZone: 'America/Denver' });
    expect(card?.proofLine).toBe('Check-in proof');
  });

  it('is nothing at all for a post with no workout behind it', () => {
    expect(workoutCardForPost({ stats: null, timeZone: 'America/Denver' })).toBeNull();
  });
});

describe('matching a post’s media against the card the server named', () => {
  const CARD = 'https://x.supabase.co/storage/v1/object/sign/p/hr_monitor-1788650051711.jpg?token=abc';

  it('matches the card', () => {
    expect(isWorkoutCardUrl(CARD, CARD)).toBe(true);
  });

  it('still matches after the URL is signed again with a new token', () => {
    expect(isWorkoutCardUrl(CARD, `${CARD.split('?')[0]}?token=zzz`)).toBe(true);
  });

  it('does not match a selfie on the same check-in', () => {
    expect(isWorkoutCardUrl(CARD.replace('hr_monitor', 'photo'), CARD)).toBe(false);
  });

  it('matches nothing when the server named no card', () => {
    expect(isWorkoutCardUrl(CARD, null)).toBe(false);
    expect(isWorkoutCardUrl(null, CARD)).toBe(false);
    expect(isWorkoutCardUrl('', '')).toBe(false);
  });
});

describe('the workout slide a feed post carries', () => {
  const CARD = 'https://x.supabase.co/storage/v1/object/sign/p/hr_monitor-1.jpg?token=abc';

  it('names the media it replaces and draws the stored miles', () => {
    const slide = workoutSlideForPost({
      stats: { ...WALK_STATS, card_url: CARD },
      challengeTitle: '30-Day Consistency',
      checkinId: 'c-1',
    });
    expect(slide?.url).toBe(CARD);
    expect(slide?.card.distanceLine).toBe('6.24 mi');
    expect(slide?.activityType).toBe('walking');
    expect(slide?.checkinId).toBe('c-1');
  });

  it('is nothing when the check-in has numbers but no card on the post', () => {
    expect(workoutSlideForPost({ stats: WALK_STATS, checkinId: 'c-1' })).toBeNull();
  });

  it('is nothing for a post that is not a workout check-in', () => {
    expect(workoutSlideForPost({ stats: { card_url: CARD, pronoun: 'he' } })).toBeNull();
    expect(workoutSlideForPost({ stats: null })).toBeNull();
  });

  it('keeps what the lightbox needs to add the route once it loads', () => {
    const slide = workoutSlideForPost({
      stats: { ...WALK_STATS, card_url: CARD },
      challengeTitle: '30-Day Consistency',
      checkinId: 'c-1',
    });
    expect(slide?.stats?.distance_m).toBe(10042);
    expect(slide?.challengeTitle).toBe('30-Day Consistency');
    expect(slide?.timeZone).toBeTruthy();
  });
});
