/**
 * Display-safe fitness stats carried on a check-in post (`posts.checkin_stats`).
 * Derived server-side from the Health snapshot. Never carries a vendor workout id and never
 * carries body metrics. Distinct from `healthProofLines`, which formats the challenge overview.
 */
export type CheckinProofStats = {
  activity?: string | null;
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
};

export type ProofStatChip = { key: string; label: string };

/** Only these activities read as a distance effort, so only they get a miles chip. */
const DISTANCE_ACTIVITIES = new Set(['running', 'walking', 'cycling']);

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

function wantsDistance(activity?: string | null): boolean {
  return DISTANCE_ACTIVITIES.has(String(activity ?? '').trim().toLowerCase());
}

/**
 * Compact chips for the post. Missing fields are dropped rather than shown as zero, so an honor
 * or non-fitness check-in produces an empty row and renders nothing.
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
  const avg = positive(stats.hr_avg);
  if (avg != null) {
    chips.push({ key: 'hr', label: `${Math.round(avg)} bpm avg` });
  }
  const miles = wantsDistance(stats.activity) ? proofStatsMiles(stats.distance_m) : null;
  if (miles != null) {
    chips.push({ key: 'distance', label: milesLabel(miles) });
  }
  return chips;
}

export function hasProofStats(stats?: CheckinProofStats | null): boolean {
  return proofStatChips(stats).length > 0;
}

export type ProofStatsPronoun = { subject: string; possessive: string };

/** they/them is the fallback whenever the author has not set a gender or pronoun. */
export const THEY_THEM: ProofStatsPronoun = { subject: 'they', possessive: 'their' };

const PRONOUNS: Record<string, ProofStatsPronoun> = {
  he: { subject: 'he', possessive: 'his' },
  him: { subject: 'he', possessive: 'his' },
  she: { subject: 'she', possessive: 'her' },
  her: { subject: 'she', possessive: 'her' },
  they: THEY_THEM,
  them: THEY_THEM,
};

/** Maps the stamped subject pronoun onto its possessive. Unknown values fall back to they/them. */
export function pronounFromStats(stats?: CheckinProofStats | null): ProofStatsPronoun {
  const raw = String(stats?.pronoun ?? '').trim().toLowerCase();
  return PRONOUNS[raw] ?? THEY_THEM;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Optional prose built only from the numbers above plus the display name and pronoun. It states
 * nothing the stats do not contain — no activity narration, no "{Name} is {task}!".
 */
export function proofStatsProse(input: {
  stats?: CheckinProofStats | null;
  displayName?: string | null;
  pronoun?: ProofStatsPronoun;
}): string | null {
  const stats = input.stats;
  if (!stats) {
    return null;
  }
  const name = (input.displayName ?? '').trim();
  const pronoun = input.pronoun ?? pronounFromStats(stats);
  const minutes = proofStatsMinutes(stats.duration_sec);
  const calories = positive(stats.active_cal) ?? positive(stats.total_cal);
  const miles = wantsDistance(stats.activity) ? proofStatsMiles(stats.distance_m) : null;
  const avg = positive(stats.hr_avg);

  // Prose needs all three of calories, duration and average heart rate. With fewer than that the
  // chips above already say everything, and a partial sentence reads like missing data.
  if (calories == null || minutes == null || avg == null) {
    return null;
  }

  const subject = name || capitalize(pronoun.subject);
  const sentences = [
    `${subject} burned ${Math.round(calories)} calories in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
    `Average heart rate ${Math.round(avg)} bpm.`,
  ];
  // No clocks here even when the session has a window: the prose is numbers only.
  if (miles != null) {
    sentences.push(`Traveled ${milesLabel(miles)}.`);
  }
  return sentences.join(' ');
}
