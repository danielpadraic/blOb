import { formatIncrementCount, formatMoneySentenceAmount, shortComparableBoardLabel } from '@/lib/comparablePoints';
import { formatHealthDuration } from '@/lib/health/durationChip';

/**
 * Display-safe check-in stats carried on a post (`posts.checkin_stats`).
 * Fitness numbers come from the Health snapshot. Honor / points numbers come from the
 * scoring_config fields that were on that log. Never a generated caption.
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
  /** Host or moderator who logged this check-in for the participant. */
  logged_by?: string | null;
  logged_by_name?: string | null;
  /**
   * Honor / comparable-points recap. `honor_card` is the stable backfill mark.
   * Fields are the activities + multiplier + money rows from scoring_config, not a hardcoded list.
   */
  source?: string | null;
  honor_fields?: Array<{
    key?: string;
    label?: string;
    chip_label?: string;
    value?: number;
    kind?: string;
    icon_key?: string;
  }> | null;
  scoring_lane?: string | null;
  lane_label?: string | null;
  challenge_title?: string | null;
  period_label?: string | null;
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

function honorFieldChips(stats: CheckinProofStats): ProofStatChip[] {
  const rows = Array.isArray(stats.honor_fields) ? stats.honor_fields : [];
  const chips: ProofStatChip[] = [];
  for (const row of rows) {
    const key = String(row?.key ?? '').trim();
    const label = String(row?.label ?? '').trim();
    if (!key || !label) {
      continue;
    }
    const raw = Number(row?.value);
    const value = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    const chipName = String(row?.chip_label ?? '').trim() || shortComparableBoardLabel(label);
    if (row?.kind === 'money') {
      const money = formatMoneySentenceAmount(value);
      chips.push({
        key,
        label: chipName && !money.includes(chipName) ? `${money} ${chipName}` : money,
      });
      continue;
    }
    chips.push({ key, label: `${formatIncrementCount(value)} ${chipName}`.trim() });
  }
  return chips;
}

/**
 * Compact chips for the post.
 *
 * Fitness: missing fields are dropped rather than shown as zero.
 * Honor / points: every form field is a chip, including zeros. Details text is never a chip.
 *
 * Order matches the composer: duration · calories · distance · average HR — or the scoring_config
 * activity / multiplier / money rows in form order.
 */
export function proofStatChips(stats?: CheckinProofStats | null): ProofStatChip[] {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
    return [];
  }
  const honor = honorFieldChips(stats);
  if (honor.length > 0 || String(stats.source ?? '').trim() === 'honor_card') {
    return honor;
  }
  const chips: ProofStatChip[] = [];
  const duration = formatHealthDuration(stats.duration_sec);
  if (duration) {
    chips.push({ key: 'duration', label: `Workout Time ${duration}` });
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
