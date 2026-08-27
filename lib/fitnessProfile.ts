import { z } from 'zod';

import { preferredUnitSystem, type BodyUnitSystem } from '@/lib/bodyMetrics';
import type { FitnessProfile, Profile } from '@/lib/types';

export type { FitnessProfile };

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const PRIMARY_GOALS = ['strength', 'endurance', 'fat_loss', 'general', 'competition'] as const;
export const TRAINING_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const LAST_DONE_VALUES = ['lt_30d', '3m', '6m', '1y', '2y', '5y', 'gt_5y'] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number];
export type LastDoneBucket = (typeof LAST_DONE_VALUES)[number];
export type FitnessSport = { name: string; last_done: LastDoneBucket };

export const LAST_DONE_LABELS: Record<LastDoneBucket, string> = {
  lt_30d: '<30 days',
  '3m': '3 mo',
  '6m': '6 mo',
  '1y': '1 yr',
  '2y': '2 yr',
  '5y': '5 yr',
  gt_5y: '>5 yr',
};

export const LAST_DONE_DEFAULT: LastDoneBucket = 'lt_30d';

export const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: 'beginner', label: 'Getting going', hint: 'New, returning, or still finding a groove.' },
  { value: 'intermediate', label: 'Solid rhythm', hint: 'I train most weeks and know the basics.' },
  { value: 'advanced', label: 'Been at this', hint: 'Years in. I know how I like to train.' },
];

export const GOAL_OPTIONS: { value: PrimaryGoal; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'fat_loss', label: 'Composition' },
  { value: 'general', label: 'Stay active' },
  { value: 'competition', label: 'Compete' },
];

export const SPORT_PRESETS = [
  'running',
  'lifting',
  'hyrox',
  'cycling',
  'swimming',
  'walking',
  'hiit',
  'soccer',
  'basketball',
  'yoga',
] as const;

export const LIMITATION_OPTIONS = [
  { value: 'knees', label: 'Knees' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'wrists', label: 'Wrists' },
  { value: 'ankles', label: 'Ankles' },
  { value: 'hips', label: 'Hips' },
  { value: 'recovering', label: 'Recovering' },
] as const;

export const EQUIPMENT_OPTIONS = [
  { value: 'commercial_gym', label: 'Gym' },
  { value: 'home_gym', label: 'Home gym' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'kettlebells', label: 'Kettlebells' },
  { value: 'bands', label: 'Bands' },
  { value: 'cardio_machines', label: 'Cardio machines' },
  { value: 'outdoor', label: 'Outdoors' },
  { value: 'bike', label: 'Bike' },
  { value: 'pool', label: 'Pool' },
  { value: 'bodyweight', label: 'Just me' },
] as const;

const lastDoneSchema = z.enum(LAST_DONE_VALUES);

const sportSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    last_done: lastDoneSchema.optional(),
    years: z.coerce.number().min(0).max(80).optional(),
  })
  .transform((row) => ({
    name: row.name,
    last_done: row.last_done ?? yearsToLastDone(row.years),
  }));

export const fitnessProfileSchema = z.object({
  experience_level: z.enum(EXPERIENCE_LEVELS),
  primary_goals: z.array(z.enum(PRIMARY_GOALS)).max(5).default([]),
  primary_goal: z.enum(PRIMARY_GOALS).optional(),
  training_days_per_week: z.number().int().min(1).max(7),
  sports: z.array(sportSchema).max(12),
  last_mile_run: z.union([z.literal('never'), z.string().min(1).max(24)]),
  limitations: z.array(z.string().min(1).max(40)).max(12),
  limitations_notes: z.string().max(280),
  preferred_units: z.enum(['imperial', 'metric']),
  equipment_access: z.array(z.string().min(1).max(40)).max(16),
});

const fitnessProfileParseSchema = fitnessProfileSchema.extend({
  training_days_per_week: z.coerce.number().int().min(1).max(7),
});

export function asLastDone(value: unknown): LastDoneBucket {
  if (typeof value === 'string' && LAST_DONE_VALUES.includes(value as LastDoneBucket)) {
    return value as LastDoneBucket;
  }
  return LAST_DONE_DEFAULT;
}

export function yearsToLastDone(years?: number | null): LastDoneBucket {
  if (years == null || !Number.isFinite(years)) {
    return LAST_DONE_DEFAULT;
  }
  if (years < 0.2) {
    return 'lt_30d';
  }
  if (years < 0.4) {
    return '3m';
  }
  if (years < 0.8) {
    return '6m';
  }
  if (years < 1.5) {
    return '1y';
  }
  if (years < 3.5) {
    return '2y';
  }
  if (years < 5.5) {
    return '5y';
  }
  return 'gt_5y';
}

export function parseFitnessProfile(raw: unknown): FitnessProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const goalsRaw = row.primary_goals;
  const legacyGoal = row.primary_goal;
  const primary_goals = Array.isArray(goalsRaw)
    ? goalsRaw.filter((item): item is PrimaryGoal =>
        typeof item === 'string' && PRIMARY_GOALS.includes(item as PrimaryGoal),
      )
    : typeof legacyGoal === 'string' && PRIMARY_GOALS.includes(legacyGoal as PrimaryGoal)
      ? [legacyGoal as PrimaryGoal]
      : [];
  const parsed = fitnessProfileParseSchema.safeParse({
    ...row,
    primary_goals,
    primary_goal: primary_goals[0],
  });
  if (!parsed.success) {
    return null;
  }
  return {
    ...parsed.data,
    primary_goals,
    primary_goal: primary_goals[0] ?? parsed.data.primary_goal ?? 'general',
  };
}

export function emptyFitnessProfile(units: BodyUnitSystem = 'imperial'): FitnessProfile {
  return {
    experience_level: 'beginner',
    primary_goal: 'general',
    primary_goals: [],
    training_days_per_week: 3,
    sports: [],
    last_mile_run: 'never',
    limitations: [],
    limitations_notes: '',
    preferred_units: units,
    equipment_access: [],
  };
}

export function fitnessProfileFromUser(profile?: Profile | null): FitnessProfile {
  const existing = parseFitnessProfile(profile?.fitness_profile);
  const units = preferredUnitSystem({
    weight_unit: profile?.weight_unit,
    preferred_units: existing?.preferred_units,
  });
  const base = emptyFitnessProfile(units);
  const days = profile?.typical_weekly_workout_frequency;
  const fromActivities = (profile?.primary_activities ?? [])
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((name) => ({ name, last_done: LAST_DONE_DEFAULT }));

  return {
    ...base,
    ...existing,
    preferred_units: units,
    training_days_per_week: clampDays(
      existing?.training_days_per_week ?? (typeof days === 'number' ? days : 3),
    ),
    sports: existing?.sports?.length ? existing.sports : fromActivities,
    primary_goals: existing?.primary_goals ?? [],
    primary_goal: existing?.primary_goals?.[0] ?? existing?.primary_goal ?? 'general',
  };
}

export function hasCompletedFitnessHistory(
  profile?: { fitness_profile?: unknown } | null,
): boolean {
  const parsed = parseFitnessProfile(profile?.fitness_profile);
  return Boolean(parsed?.experience_level);
}

export function clampDays(value: number): number {
  if (!Number.isFinite(value)) {
    return 3;
  }
  return Math.min(7, Math.max(1, Math.round(value)));
}

export function sportLabel(name: string): string {
  const lower = name.trim().toLowerCase();
  if (lower === 'hiit') {
    return 'HIIT';
  }
  if (lower === 'hyrox') {
    return 'HYROX';
  }
  if (!lower) {
    return name;
  }
  return lower.slice(0, 1).toUpperCase() + lower.slice(1);
}

/** Store mile times as m:ss, or "never". */
export function normalizeMileTime(value: string): string | 'never' {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === 'never' || trimmed === 'n/a' || trimmed === 'na') {
    return 'never';
  }
  const compact = trimmed.replace(/\s+/g, '');
  const match = compact.match(/^(\d{1,2})[:.](\d{1,2})$/) ?? compact.match(/^(\d{1,2})(\d{2})$/);
  if (!match) {
    return trimmed.slice(0, 24);
  }
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59 || minutes > 59) {
    return trimmed.slice(0, 24);
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatMileTime(value: string | 'never' | null | undefined): string {
  if (!value || value === 'never') {
    return 'Never';
  }
  return value;
}

export function experienceLabel(value?: string | null): string {
  return EXPERIENCE_OPTIONS.find((option) => option.value === value)?.label ?? 'Not set';
}

export function goalLabel(value?: string | null): string {
  return GOAL_OPTIONS.find((option) => option.value === value)?.label ?? 'Not set';
}

export function goalsLabel(goals?: string[] | null, fallback?: string | null): string {
  const labels = (goals ?? []).map((goal) => goalLabel(goal)).filter((label) => label !== 'Not set');
  if (labels.length > 0) {
    return labels.join(', ');
  }
  return goalLabel(fallback);
}

export function toggleString<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
