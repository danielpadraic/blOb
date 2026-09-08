/**
 * Display-safe fitness stats carried on a check-in post (`posts.checkin_stats`).
 * Derived server-side from the Health snapshot. Never carries a vendor workout id and never
 * carries body metrics. Distinct from `healthProofLines`, which formats the challenge overview.
 */
export type CheckinProofStats = {
  activity?: string | null;
  /**
   * The vendor's own wording for the activity ("Pickleball", "High Intensity Interval Training"),
   * which is the card's headline. Stamped server-side from the owner-only workout row, because
   * humanizing the stored type alone would call a game of pickleball "Other".
   */
  activity_label?: string | null;
  duration_sec?: number | null;
  active_cal?: number | null;
  total_cal?: number | null;
  hr_min?: number | null;
  hr_avg?: number | null;
  hr_max?: number | null;
  distance_m?: number | null;
  /**
   * Subject pronoun for the check-in author, stamped server-side from their own profile.
   * The author's pronoun rides along with their own post; it is never queryable per profile.
   */
  pronoun?: string | null;
  /**
   * Which of the post's media is the generated workout card, named by the server because the client
   * cannot tell: the file name follows the proof slot's method, and the slot itself is readable only
   * by participants. The feed draws that slide from these numbers instead of showing the file.
   */
  card_url?: string | null;
  /**
   * The heart-rate trace in BPM, thinned server-side from the check-in's own snapshot.
   *
   * It rides on the post so the card graphs the workout for anyone who can see the post, not only the
   * challenge's participants. Same class of reading as hr_avg and hr_max, which were already here; no
   * timestamps, so it says how the effort moved and not where or when.
   */
  hr_series?: number[] | null;
};

export type ProofStatChip = { key: string; label: string };

/** Only these activities used to hide miles. Screenshots still show distance when the screen had it. */

function positive(value?: number | null): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function proofStatsMinutes(durationSec?: number | null): number | null {
  const seconds = positive(durationSec);
  if (seconds == null) {
    return null;
  }
  return Math.max(1, Math.round(seconds / 60));
}

export function proofStatsMiles(distanceM?: number | null): number | null {
  const meters = positive(distanceM);
  if (meters == null) {
    return null;
  }
  return meters / 1609.344;
}

function milesLabel(miles: number): string {
  return `${miles < 10 ? miles.toFixed(2) : miles.toFixed(1)} mi`;
}

/**
 * Compact chips for the post. Missing fields are dropped rather than shown as zero, so an honor
 * or non-fitness check-in produces an empty row and renders nothing.
 *
 * Order matches the composer: duration · calories · distance · average HR.
 */
export function proofStatChips(stats?: CheckinProofStats | null): ProofStatChip[] {
  if (!stats) {
    return [];
  }
  const chips: ProofStatChip[] = [];
  const minutes = proofStatsMinutes(stats.duration_sec);
  if (minutes != null) {
    chips.push({ key: 'duration', label: `${minutes} min` });
  }
  const calories = positive(stats.active_cal) ?? positive(stats.total_cal);
  if (calories != null) {
    chips.push({ key: 'calories', label: `${Math.round(calories)} cal` });
  }
  const miles = proofStatsMiles(stats.distance_m);
  if (miles != null) {
    chips.push({ key: 'distance', label: milesLabel(miles) });
  }
  const avg = positive(stats.hr_avg);
  if (avg != null) {
    chips.push({ key: 'hr', label: `${Math.round(avg)} bpm avg` });
  }
  return chips;
}

export function hasProofStats(stats?: CheckinProofStats | null): boolean {
  return proofStatChips(stats).length > 0;
}

/**
 * There is deliberately no prose builder here. A check-in body is the user's own text or
 * "Check-in Complete" — the app does not narrate their workout back at them. The chips above carry
 * the numbers; a generated "{Name} burned N calories in M minutes." sentence is not a caption the
 * user wrote, so Home and Live never show one.
 */
