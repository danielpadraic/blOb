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

/** they/them is the fallback because pronouns are never on the public profile. */
export const THEY_THEM: ProofStatsPronoun = { subject: 'they', possessive: 'their' };

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? '';
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
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
  const pronoun = input.pronoun ?? THEY_THEM;
  const minutes = proofStatsMinutes(stats.duration_sec);
  const calories = positive(stats.active_cal) ?? positive(stats.total_cal);
  const miles = wantsDistance(stats.activity) ? proofStatsMiles(stats.distance_m) : null;
  const avg = positive(stats.hr_avg);

  const efforts: string[] = [];
  if (minutes != null) {
    efforts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  if (miles != null) {
    efforts.push(milesLabel(miles));
  }
  if (calories != null) {
    efforts.push(`${Math.round(calories)} calories`);
  }
  // One number alone is already the chip; prose only earns its place with more than one.
  if (efforts.length + (avg != null ? 1 : 0) < 2) {
    return null;
  }

  const subject = name || capitalize(pronoun.subject);
  const sentences = [`${subject} logged ${joinList(efforts)}.`];
  if (avg != null) {
    sentences.push(`${capitalize(pronoun.possessive)} average heart rate was ${Math.round(avg)} bpm.`);
  }
  return sentences.join(' ');
}
