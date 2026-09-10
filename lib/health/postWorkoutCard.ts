import { uniqueProofUrls } from '@/lib/challengeProofs';
import type { CheckinProofStats } from '@/lib/checkin/proofStats';
import { activityTypeOf, labelFromActivityType, workoutFromStoredSession } from '@/lib/health/cardRedraw';
import type { CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { buildWorkoutProofCard, type WorkoutProofCardModel } from '@/lib/health/workoutProofCard';
import type { HealthActivityType, HealthWorkout } from '@/services/health/types';

/** Last-slide token for a recap drawn from stored numbers. Never a stored media URL. */
export const WORKOUT_CARD_SLIDE = 'blob:workout-card';

/**
 * The workout card a posted check-in shows, drawn from what is stored rather than from the picture.
 *
 * The card used to be a flattened JPEG, which made the image the source of truth: a walk whose miles
 * were repaired in the database kept printing `0.00 mi`, because the numbers had already been baked
 * into pixels. Building the card at render time instead means the post shows what the row says, and
 * a fix to the data or the renderer reaches every card that was ever posted without redrawing files.
 *
 * Two stores can feed it, because they are not readable by the same people:
 *
 * - `posts.checkin_stats` rides on the post, so anyone who can see the post can see the numbers. It
 *   carries no clock and no GPS track.
 * - `proof_parts[slot].health` is the whole session summary, including the route, but
 *   `challenge_checkins` is readable only by participants of that challenge.
 *
 * So the snapshot is preferred and the post stats are the floor. A viewer outside the challenge gets
 * a card with real distance, time, heart rate and calories but no map and no wall-clock range — and
 * crucially not an invented one. Deriving the workout window from when the post was created would
 * print a time the workout did not happen at, which on a proof artifact is worse than printing none.
 */

/**
 * Whether this piece of a post's media is the generated workout card the server named.
 *
 * Compared without the query string: proof URLs are signed, and the same file re-signed carries a
 * different token, which would otherwise stop matching its own card.
 */
export function isWorkoutCardSlide(url?: string | null): boolean {
  return String(url ?? '').split('?')[0] === WORKOUT_CARD_SLIDE;
}

export function isWorkoutCardUrl(url?: string | null, cardUrl?: string | null): boolean {
  if (isWorkoutCardSlide(url)) {
    return true;
  }
  const file = String(url ?? '').split('?')[0];
  const card = String(cardUrl ?? '').split('?')[0];
  return file.length > 0 && file === card;
}

/**
 * Rasterized recap files are PNG. Phone Fitness / vendor screenshots are JPEG or HEIC.
 * A JPEG named in card_url is the user still, not a card to paint over.
 */
export function isGeneratedWorkoutCardFile(url?: string | null): boolean {
  if (isWorkoutCardSlide(url)) {
    return true;
  }
  const path = String(url ?? '').split('?')[0].toLowerCase();
  return path.endsWith('.png');
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

function isVendorRecapUrl(url: string, vendorCardUrl: string): boolean {
  if (isWorkoutCardSlide(url) || isGeneratedWorkoutCardFile(url)) {
    return true;
  }
  if (vendorCardUrl && isWorkoutCardUrl(url, vendorCardUrl)) {
    return true;
  }
  if (vendorCardUrl) {
    const cardStem = proofMediaStem(vendorCardUrl);
    const urlStem = proofMediaStem(url);
    return Boolean(cardStem) && cardStem === urlStem;
  }
  return false;
}

/**
 * User stills first, generated recap last. Never paints the recap over a screenshot URL.
 *
 * A. HealthKit / Health Connect (`card_url` set): exactly one recap. The vendor file is often a
 *    JPEG (`hr_monitor-*.jpg`); do not treat it as a screenshot and append a second card.
 * B. OCR / user screenshot (`card_url` absent): stills stay, plus at most one recap.
 * C. Honor / selfie with no workout numbers: unchanged. No recap.
 */
export function pagerUrlsWithWorkoutCard(
  urls: string[],
  stats?: CheckinProofStats | null,
): string[] {
  const list = uniqueProofUrls(urls);
  const hasCard = workoutFromPostStats(stats) != null;
  if (!hasCard) {
    return list.filter((url) => !isWorkoutCardSlide(url));
  }
  const vendorCardUrl = namedVendorCardUrl(stats);
  const stills = list.filter((url) => !isVendorRecapUrl(url, vendorCardUrl));
  if (stills.length > 0) {
    return uniqueProofUrls([...stills, WORKOUT_CARD_SLIDE]);
  }
  if (vendorCardUrl) {
    const named = list.find((url) => isWorkoutCardUrl(url, vendorCardUrl));
    return [named ?? vendorCardUrl];
  }
  const generated = list.find((url) => isGeneratedWorkoutCardFile(url) && !isWorkoutCardSlide(url));
  if (generated) {
    return [generated];
  }
  return uniqueProofUrls([...list.filter((url) => !isWorkoutCardSlide(url)), WORKOUT_CARD_SLIDE]);
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
 * The workout slide a feed post carries: which of its media is the card, and the card to draw there.
 *
 * Named `card_url` is the HealthKit raster (often JPEG after upload). Screenshot check-ins have
 * numbers but no named card, so the recap draws on the virtual last slide instead of replacing a
 * user still.
 */
export function workoutSlideForPost(input: {
  stats?: CheckinProofStats | null;
  challengeTitle?: string | null;
  checkinId?: string | null;
  timeZone?: string;
}): PostWorkoutSlide | null {
  const timeZone = input.timeZone ?? deviceTimeZone();
  const card = workoutCardForPost({
    stats: input.stats,
    challengeTitle: input.challengeTitle,
    timeZone,
  });
  if (!card) {
    return null;
  }
  const url = namedVendorCardUrl(input.stats) || WORKOUT_CARD_SLIDE;
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
  /** The media this card replaces. */
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
