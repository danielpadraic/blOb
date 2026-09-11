import { uniqueProofUrls } from '@/lib/challengeProofs';
import type { CheckinProofStats } from '@/lib/checkin/proofStats';
import { activityTypeOf, labelFromActivityType, workoutFromStoredSession } from '@/lib/health/cardRedraw';
import type { CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { buildWorkoutProofCard, type WorkoutProofCardModel } from '@/lib/health/workoutProofCard';
import type { HealthActivityType, HealthWorkout } from '@/services/health/types';

/** Legacy in-app token. Never stored. Home / Live / lightbox do not invent this slide. */
export const WORKOUT_CARD_SLIDE = 'blob:workout-card';

/** Storage path prefix for rasterized recap uploads (`user/challenge/workout_card-<stamp>.jpg`). */
export const WORKOUT_CARD_PATH_PREFIX = 'workout_card-';

const WORKOUT_CARD_PATH_RE = /\/workout_card-\d+\.(jpe?g|png|webp)$/i;

/**
 * Recap JPEG vs a selfie / screenshot / extra.
 *
 * A URL is a recap when:
 * 1. It matches `posts.checkin_stats.card_url` (query string ignored — signed URLs rotate), or
 * 2. Its storage path uses the `workout_card-` prefix from workoutProofCard uploads, or
 * 3. It is the leftover `blob:workout-card` token (never shown as a fake branded card).
 *
 * Pre / post selfies, HR screenshots, and extras fail all three. OCR / manual / honor never earn a
 * `card_url` or a `workout_card-` file, so they stay photos.
 */

/** Whether this piece of media is the leftover virtual token — not a stored file. */
export function isWorkoutCardSlide(url?: string | null): boolean {
  return String(url ?? '').split('?')[0] === WORKOUT_CARD_SLIDE;
}

export function isWorkoutCardStoragePath(url?: string | null): boolean {
  const path = String(url ?? '').split('?')[0];
  return WORKOUT_CARD_PATH_RE.test(path);
}

export function isWorkoutCardUrl(url?: string | null, cardUrl?: string | null): boolean {
  if (isWorkoutCardSlide(url)) {
    return true;
  }
  const file = String(url ?? '').split('?')[0];
  const card = String(cardUrl ?? '').split('?')[0];
  return file.length > 0 && file === card;
}

/** Recap JPEG (or leftover token). Selfies and screenshots return false. */
export function isRecapCardUrl(url?: string | null, cardUrl?: string | null): boolean {
  if (isWorkoutCardSlide(url) || isWorkoutCardStoragePath(url)) {
    return true;
  }
  const named = String(cardUrl ?? '').trim();
  if (!named || named.startsWith('health:')) {
    return false;
  }
  return isWorkoutCardUrl(url, named);
}

/**
 * @deprecated Use `isRecapCardUrl`. Kept so OCR skip still ignores a recap file, not every PNG.
 */
export function isGeneratedWorkoutCardFile(url?: string | null, cardUrl?: string | null): boolean {
  return isRecapCardUrl(url, cardUrl);
}

/**
 * Server names `card_url` only for a vendor raster (HealthKit / Health Connect).
 * That file is often JPEG because proof upload compresses the PNG card to `.jpg`.
 */
export function namedVendorCardUrl(stats?: CheckinProofStats | null): string {
  const cardUrl = String(stats?.card_url ?? '').trim();
  if (!cardUrl || cardUrl.startsWith('health:')) {
    return '';
  }
  return cardUrl;
}

/** Same proof-slot stem (`hr_monitor`, `distance`) so a cloned vendor card is not a user still. */
export function proofMediaStem(url?: string | null): string {
  const base = String(url ?? '')
    .split('?')[0]
    .split('/')
    .pop()
    ?.toLowerCase() ?? '';
  return base.replace(/-\d+.*$/, '').replace(/\.[a-z0-9]+$/, '');
}

/**
 * Required stills, then extras, then the recap JPEG if present. Same list on Home, Live, lightbox.
 *
 * Vendor HealthKit / Health Connect posts earn a card (`card_url` or `workout_card-` path).
 * OCR / manual / selfie-only posts do not get a fake branded slide.
 * Never replaces a selfie with the card. Never hides the JPEG behind `blob:workout-card`.
 */
export function pagerUrlsWithWorkoutCard(
  urls: string[],
  stats?: CheckinProofStats | null,
): string[] {
  const list = uniqueProofUrls(urls).filter((url) => !isWorkoutCardSlide(url));
  const vendorCardUrl = namedVendorCardUrl(stats);
  const stills: string[] = [];
  const cards: string[] = [];
  for (const url of list) {
    if (isRecapCardUrl(url, vendorCardUrl)) {
      cards.push(url);
    } else {
      stills.push(url);
    }
  }
  let recap = '';
  if (vendorCardUrl) {
    recap = cards.find((url) => isWorkoutCardUrl(url, vendorCardUrl)) ?? vendorCardUrl;
  } else if (cards[0]) {
    recap = cards[0];
  }
  if (!recap) {
    return stills;
  }
  return uniqueProofUrls([...stills, recap]);
}

/**
 * A workout rebuilt from the numbers on the post. Carries no window: `checkin_stats` never stored
 * one, and the card omits its date and time range rather than guessing them from the post.
 */
export function workoutFromPostStats(stats?: CheckinProofStats | null): HealthWorkout | null {
  if (!stats) {
    return null;
  }
  const durationSec = Number(stats.duration_sec);
  const distanceM = Number(stats.distance_m);
  const hasDuration = Number.isFinite(durationSec) && durationSec > 0;
  const hasDistance = Number.isFinite(distanceM) && distanceM > 0;
  const calories = Number(stats.active_cal) || Number(stats.total_cal);
  const hasCalories = Number.isFinite(calories) && calories > 0;
  const avg = Number(stats.hr_avg);
  const max = Number(stats.hr_max);
  const min = Number(stats.hr_min);
  const hasHr =
    (Number.isFinite(avg) && avg > 0) ||
    (Number.isFinite(max) && max > 0) ||
    (Number.isFinite(min) && min > 0);
  // A duration-only or HR-only screenshot is a valid recap. Honor check-ins still have none of these.
  if (!hasDuration && !hasDistance && !hasCalories && !hasHr) {
    return null;
  }
  const activity = String(stats.activity ?? '').trim() || 'other';
  const workout: HealthWorkout = {
    providerWorkoutId: '',
    source: 'apple_health',
    activityType: activityTypeOf(activity),
    // The vendor's wording is the headline when the post carried it. Humanizing the type is the
    // fallback, and a poor one: "other" is the type behind pickleball, tennis and every sport.
    activityLabel: String(stats.activity_label ?? '').trim() || labelFromActivityType(activity),
    startedAt: '',
    endedAt: '',
    durationSec: hasDuration ? Math.round(durationSec) : 0,
    // The post stats drop the recording device, so the card says "Recorded in Apple Health" rather
    // than claiming a watch it cannot see.
    confidence: 'unknown',
  };
  if (hasDistance) {
    workout.distanceM = Math.round(distanceM);
  }
  if (hasCalories) {
    workout.caloriesKcal = Math.round(calories);
  }
  if (Number.isFinite(avg) && avg > 0) {
    workout.hrAvg = Math.round(avg);
  }
  if (Number.isFinite(max) && max > 0) {
    workout.hrMax = Math.round(max);
  }
  if (Number.isFinite(min) && min > 0) {
    workout.hrMin = Math.round(min);
  }
  return workout;
}

/**
 * Named vendor JPEG only. OCR / numbers-only posts get no virtual slide — chips stay, no fake card.
 */
export function workoutSlideForPost(input: {
  stats?: CheckinProofStats | null;
  challengeTitle?: string | null;
  checkinId?: string | null;
  timeZone?: string;
}): PostWorkoutSlide | null {
  const url = namedVendorCardUrl(input.stats);
  if (!url) {
    return null;
  }
  const timeZone = input.timeZone ?? deviceTimeZone();
  const card = workoutCardForPost({
    stats: input.stats,
    challengeTitle: input.challengeTitle,
    timeZone,
  });
  if (!card) {
    return null;
  }
  return {
    url,
    card,
    activityType: activityTypeOf(String(input.stats?.activity ?? 'other')),
    checkinId: input.checkinId ?? null,
    stats: input.stats ?? null,
    challengeTitle: input.challengeTitle ?? null,
    timeZone,
  };
}

export type PostWorkoutSlide = {
  /** The stored recap JPEG this model describes. The carousel shows that file, not this overlay. */
  url: string;
  card: WorkoutProofCardModel;
  activityType: HealthActivityType;
  checkinId: string | null;
  stats: CheckinProofStats | null;
  challengeTitle: string | null;
  timeZone: string;
};

/**
 * Only reached for a card built from post stats, which carries no clock — so this decides nothing the
 * reader sees today. It is here so the formatter has a zone to work in rather than throwing.
 */
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * The card for a posted check-in, or null when the post is not a workout.
 *
 * `health` is the participant-only session snapshot and wins when present, because it is the only
 * source with the workout's real clock and its GPS track. `stats` is what every viewer can read.
 */
export function workoutCardForPost(input: {
  stats?: CheckinProofStats | null;
  health?: CheckinHealthProof | null;
  /** Apple's own wording for the activity, when a session row kept it. */
  activityLabel?: string | null;
  challengeTitle?: string | null;
  timeZone: string;
}): WorkoutProofCardModel | null {
  const fromSnapshot = input.health
    ? workoutFromStoredSession(
        input.health,
        input.activityLabel ?? input.stats?.activity_label,
        null,
      )
    : null;
  const workout = fromSnapshot ?? workoutFromPostStats(input.stats);
  if (!workout) {
    return null;
  }
  return buildWorkoutProofCard({
    workout,
    timeZone: input.timeZone,
    challengeTitle: String(input.challengeTitle ?? '').trim(),
    // Only the snapshot can carry coordinates. The post stats deliberately never did, so a viewer
    // outside the challenge sees the stats composition instead of an empty map frame.
    route: fromSnapshot ? input.health?.route ?? null : null,
    // The trace, on the other hand, rides on the post as well as the snapshot: heart rate for the
    // length of the workout is the proof, so every viewer of the post gets to see it.
    series: input.health?.hrSeries ?? input.stats?.hr_series ?? null,
  });
}
