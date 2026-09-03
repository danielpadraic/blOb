import { storedDurationDays } from '@/lib/challengeGoal';
import { chipDef, isDietChip, type InterestRoomSlug } from '@/lib/interestsCatalog';
import { clampStanceScore, STANCE_DEFAULT } from '@/lib/interests';
import { isSportsLevel, type SportsLevel } from '@/lib/interestsFollowup';
import { OFFICIAL_WEEK_10_SLUG } from '@/lib/officialSeries';
import { createChallengeHref } from '@/lib/routes';
import {
  SIMPLE_TYPES,
  defaultSimpleDraft,
  type SimpleChallengeDraft,
  type SimpleChallengeType,
  type SimpleDurationPreset,
  type SimpleFrequency,
  type SimpleVisibility,
} from '@/lib/simpleChallenge';

export type CardDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type InterestFamily =
  | 'running'
  | 'lifting'
  | 'walking'
  | 'cycling'
  | 'hiit'
  | 'swimming'
  | 'yoga'
  | 'rowing'
  | 'sports'
  | 'hiking'
  | 'productivity'
  | 'gaming';

export type InterestChipSignal = {
  chipSlug: string;
  label: string;
  room: InterestRoomSlug;
  family: InterestFamily | null;
  sportSlug: string | null;
  stanceScore: number;
  highestLevel: SportsLevel | null;
  sortOrder: number;
};

export type InterestsRankProfile = {
  /** True when any room is complete_filled or complete_empty. Skip does not count. */
  hasCompletedRoom: boolean;
  /** Selected chips from complete_filled rooms only. Diet chips are omitted. */
  chips: InterestChipSignal[];
};

export type RankableChallenge = {
  id: string;
  title?: string | null;
  task?: string | null;
  category?: string | null;
  series_id?: string | null;
  privacy_mode?: string | null;
  visibility?: string | null;
  is_official?: boolean | null;
  created_at?: string | null;
  days_required?: number | null;
  length_value?: number | null;
  length_unit?: string | null;
  duration_days?: number | null;
};

export type InterestsSimpleStarter = {
  templateId: SimpleChallengeType;
  title: string;
  durationDays: number;
  frequencyPerWeek: number;
  visibility: SimpleVisibility;
};

type RoomStateRow = {
  room_slug: string;
  state: string;
};

type ChipStateRow = {
  stance_score?: number | string | null;
  extras?: unknown;
  catalog?: {
    slug?: string | null;
    room_slug?: string | null;
    label?: string | null;
    sort_order?: number | null;
  } | null;
};

const DIFFICULTY_ORDER: CardDifficulty[] = ['beginner', 'intermediate', 'advanced'];

const CHORE_SLUGS = new Set(['hiking', 'camping', 'fishing', 'hunting', 'gardening']);

const SPORT_FAMILY_SLUGS = new Set([
  'pickleball',
  'tennis',
  'golf',
  'basketball',
  'soccer',
  'baseball',
  'volleyball',
  'climbing',
  'martial_arts',
  'hockey',
  'football',
]);

const FAMILY_KEYWORDS: Record<Exclude<InterestFamily, 'sports'>, RegExp> = {
  running: /\b(run|running|5k|10k|half[-\s]?marathon|marathon|jog|jogging)\b/i,
  lifting: /\b(lift|lifting|strength|weights?|barbell|deadlift|squat)\b/i,
  walking: /\b(walk|walking|steps?)\b/i,
  cycling: /\b(cycl(?:e|ing)|bike|biking)\b/i,
  hiit: /\b(hiit|hyrox)\b/i,
  swimming: /\b(swim|swimming|laps?)\b/i,
  yoga: /\b(yoga|pilates|mobility)\b/i,
  rowing: /\b(row|rowing|erg)\b/i,
  hiking: /\b(hike|hiking|trail)\b/i,
  productivity: /\b(focus|productiv|read|reading|meditat|writ|study|academic|language|music)\b/i,
  gaming: /\b(esport|league of legends|valorant|fortnite|counter[- ]?strike|cs2)\b/i,
};

const MEAL_PLAN = /\b(diet|nutrition|meal[-\s]?plan|calorie|macros?)\b/i;

const SIMPLE_TYPE_IDS = new Set(SIMPLE_TYPES.map((item) => item.value));

function extrasRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function haystackOf(row: RankableChallenge): string {
  return `${row.title ?? ''} ${row.task ?? ''} ${row.category ?? ''}`.trim();
}

function isCorporate(row: RankableChallenge): boolean {
  return row.privacy_mode === 'private_corporate';
}

/** Public Simple + joinable peer cards only. Officials and corporate stay in place. */
export function isInterestBoostable(row: RankableChallenge): boolean {
  if (row.is_official || isWeek10Official(row) || isCorporate(row)) {
    return false;
  }
  return true;
}

export function isWeek10Official(row: Pick<RankableChallenge, 'series_id'>): boolean {
  return row.series_id === OFFICIAL_WEEK_10_SLUG;
}

export function familyForChip(room: InterestRoomSlug, slug: string): InterestFamily | null {
  if (isDietChip(slug) || slug === 'fasting' || slug === 'other' || slug === 'none') {
    return null;
  }
  if (room === 'sports' && SPORT_FAMILY_SLUGS.has(slug)) {
    return 'sports';
  }
  if (slug === 'running' || slug === 'trail_running') {
    return 'running';
  }
  if (slug === 'lifting') {
    return 'lifting';
  }
  if (slug === 'walking') {
    return 'walking';
  }
  if (slug === 'cycling') {
    return 'cycling';
  }
  if (slug === 'hiit' || slug === 'hyrox') {
    return 'hiit';
  }
  if (slug === 'swimming') {
    return 'swimming';
  }
  if (slug === 'yoga' || slug === 'pilates' || slug === 'mobility') {
    return 'yoga';
  }
  if (slug === 'rowing') {
    return 'rowing';
  }
  if (slug === 'hiking') {
    return 'hiking';
  }
  if (
    slug === 'reading' ||
    slug === 'writing' ||
    slug === 'academics' ||
    slug === 'meditation' ||
    slug === 'languages' ||
    slug === 'music' ||
    slug === 'work'
  ) {
    return 'productivity';
  }
  if (room === 'esports') {
    return 'gaming';
  }
  return null;
}

export function preferredDifficultyFromStance(stanceScore: number): CardDifficulty {
  const n = clampStanceScore(stanceScore);
  // 1 = Level Up (left) → intro / shorter. 50 = Excel (right) → longer / harder.
  if (n <= 20) {
    return 'beginner';
  }
  if (n >= 31) {
    return 'advanced';
  }
  return 'intermediate';
}

export function preferredDifficultyFromLevel(level: SportsLevel | null): CardDifficulty | null {
  if (level === 'recreational') {
    return 'beginner';
  }
  if (level === 'high_school') {
    return 'intermediate';
  }
  if (level === 'college' || level === 'professional') {
    return 'advanced';
  }
  return null;
}

export function cardDifficulty(row: RankableChallenge): CardDifficulty {
  const days = storedDurationDays(row);
  if (days == null) {
    return 'intermediate';
  }
  if (days <= 7) {
    return 'beginner';
  }
  if (days <= 14) {
    return 'intermediate';
  }
  return 'advanced';
}

function difficultyFit(card: CardDifficulty, preferred: CardDifficulty): number {
  return Math.abs(DIFFICULTY_ORDER.indexOf(card) - DIFFICULTY_ORDER.indexOf(preferred));
}

function sportMatches(haystack: string, slug: string, label: string): boolean {
  const needle = label.trim() || slug.replace(/_/g, ' ');
  if (!needle) {
    return false;
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}

export function cardMatchesChip(row: RankableChallenge, chip: InterestChipSignal): boolean {
  if (!chip.family || !isInterestBoostable(row)) {
    return false;
  }
  const haystack = haystackOf(row);
  if (!haystack) {
    return false;
  }
  if (chip.family === 'sports') {
    return sportMatches(haystack, chip.sportSlug ?? chip.chipSlug, chip.label);
  }
  return FAMILY_KEYWORDS[chip.family].test(haystack);
}

export function interestsRankProfile(input: {
  rooms?: RoomStateRow[] | null;
  chips?: ChipStateRow[] | null;
}): InterestsRankProfile {
  const rooms = input.rooms ?? [];
  const filled = new Set(
    rooms.filter((row) => row.state === 'complete_filled').map((row) => row.room_slug),
  );
  const hasCompletedRoom = rooms.some(
    (row) => row.state === 'complete_filled' || row.state === 'complete_empty',
  );
  const chips: InterestChipSignal[] = [];
  for (const row of input.chips ?? []) {
    const slug = String(row.catalog?.slug ?? '').trim();
    const room = String(row.catalog?.room_slug ?? '').trim() as InterestRoomSlug;
    if (!slug || !filled.has(room) || isDietChip(slug)) {
      continue;
    }
    const family = familyForChip(room, slug);
    if (!family) {
      continue;
    }
    const extras = extrasRecord(row.extras);
    const rawLevel = extras.highest_level;
    const local = chipDef(room, slug);
    chips.push({
      chipSlug: slug,
      label: String(row.catalog?.label ?? local?.label ?? slug),
      room,
      family,
      sportSlug: family === 'sports' ? slug : null,
      stanceScore: clampStanceScore(Number(row.stance_score) || STANCE_DEFAULT),
      highestLevel: typeof rawLevel === 'string' && isSportsLevel(rawLevel) ? rawLevel : null,
      sortOrder: Number(row.catalog?.sort_order) || 0,
    });
  }
  chips.sort((a, b) => a.sortOrder - b.sortOrder || a.chipSlug.localeCompare(b.chipSlug));
  return { hasCompletedRoom, chips };
}

function matchingChip(row: RankableChallenge, chips: InterestChipSignal[]): InterestChipSignal | null {
  return chips.find((chip) => cardMatchesChip(row, chip)) ?? null;
}

/**
 * Boost matching public Simple / joinable peer cards after the current list sort.
 * Officials, Weekly $10, and private corporate cards keep their existing place.
 * No completed-room chips leaves order unchanged. Ties keep the incoming order (created_at / current sort).
 */
export function rankInterestChallenges<T extends RankableChallenge>(
  rows: T[],
  profile: InterestsRankProfile,
): T[] {
  if (rows.length < 2 || profile.chips.length === 0) {
    return rows;
  }
  return [...rows]
    .map((row, index) => ({
      row,
      index,
      chip: matchingChip(row, profile.chips),
    }))
    .sort((a, b) => {
      const matched = Number(Boolean(b.chip)) - Number(Boolean(a.chip));
      if (matched !== 0) {
        return matched;
      }
      if (a.chip && b.chip && a.chip.family === b.chip.family) {
        const sameSport =
          a.chip.family === 'sports' &&
          Boolean(a.chip.sportSlug) &&
          a.chip.sportSlug === b.chip.sportSlug;
        if (a.chip.family !== 'sports' || sameSport) {
          const stanceFit =
            difficultyFit(cardDifficulty(a.row), preferredDifficultyFromStance(a.chip.stanceScore)) -
            difficultyFit(cardDifficulty(b.row), preferredDifficultyFromStance(b.chip.stanceScore));
          if (stanceFit !== 0) {
            return stanceFit;
          }
          if (sameSport) {
            const levelPref =
              preferredDifficultyFromLevel(a.chip.highestLevel) ??
              preferredDifficultyFromStance(a.chip.stanceScore);
            const levelFit =
              difficultyFit(cardDifficulty(a.row), levelPref) -
              difficultyFit(cardDifficulty(b.row), levelPref);
            if (levelFit !== 0) {
              return levelFit;
            }
          }
        }
      }
      return a.index - b.index;
    })
    .map((item) => item.row);
}

export function pickJoinableOfficialHero<T extends RankableChallenge>(
  rows: T[],
  joinedIds: Set<string>,
  isJoinable: (row: T) => boolean,
): T | null {
  const joinable = rows.filter((row) => isJoinable(row) && !joinedIds.has(row.id));
  return joinable.find((row) => isWeek10Official(row)) ?? joinable[0] ?? null;
}

function durationDaysForStance(stanceScore: number): number {
  const band = preferredDifficultyFromStance(stanceScore);
  if (band === 'beginner') {
    return 7;
  }
  if (band === 'intermediate') {
    return 14;
  }
  return 21;
}

function frequencyForStance(stanceScore: number): number {
  return preferredDifficultyFromStance(stanceScore) === 'advanced' ? 5 : 3;
}

function simpleTypeExists(id: string): id is SimpleChallengeType {
  return SIMPLE_TYPE_IDS.has(id as SimpleChallengeType);
}

export function starterForChip(input: {
  slug: string;
  label: string;
  room: InterestRoomSlug;
  stanceScore: number;
}): InterestsSimpleStarter | null {
  if (isDietChip(input.slug) || input.slug === 'fasting' || input.slug === 'other') {
    return null;
  }
  const days = durationDaysForStance(input.stanceScore);
  const frequencyPerWeek = frequencyForStance(input.stanceScore);
  const visibility: SimpleVisibility = CHORE_SLUGS.has(input.slug) ? 'friends' : 'public';
  const title = input.label;

  if (input.slug === 'running' || input.slug === 'trail_running') {
    return { templateId: 'running', title, durationDays: days, frequencyPerWeek, visibility: 'public' };
  }
  if (input.slug === 'lifting') {
    return { templateId: 'lifting', title, durationDays: days, frequencyPerWeek, visibility: 'public' };
  }
  if (input.slug === 'walking') {
    return { templateId: 'steps', title, durationDays: days, frequencyPerWeek, visibility: 'public' };
  }
  if (input.slug === 'cycling') {
    return { templateId: 'cycling', title, durationDays: days, frequencyPerWeek, visibility: 'public' };
  }
  if (input.slug === 'hiit' || input.slug === 'hyrox') {
    return { templateId: 'hiit', title, durationDays: days, frequencyPerWeek, visibility: 'public' };
  }
  if (SPORT_FAMILY_SLUGS.has(input.slug)) {
    return { templateId: 'sports', title, durationDays: days, frequencyPerWeek, visibility: 'public' };
  }
  if (
    input.slug === 'yoga' ||
    input.slug === 'pilates' ||
    input.slug === 'mobility' ||
    input.slug === 'swimming' ||
    input.slug === 'rowing'
  ) {
    return { templateId: 'any_exercise', title, durationDays: days, frequencyPerWeek, visibility: 'public' };
  }
  if (
    input.slug === 'reading' ||
    input.slug === 'writing' ||
    input.slug === 'academics' ||
    input.slug === 'meditation' ||
    input.slug === 'languages' ||
    input.slug === 'music' ||
    input.slug === 'work'
  ) {
    return { templateId: 'productivity', title, durationDays: days, frequencyPerWeek, visibility: 'public' };
  }
  if (CHORE_SLUGS.has(input.slug)) {
    return { templateId: 'custom', title, durationDays: days, frequencyPerWeek, visibility };
  }
  return null;
}

export function pickStartThisStarter(chips: {
  slug: string;
  label: string;
  room: InterestRoomSlug;
  stanceScore: number;
}[]): { starter: InterestsSimpleStarter; chipLabel: string; chipSlug: string } | null {
  for (const chip of chips) {
    const starter = starterForChip(chip);
    if (!starter || !simpleTypeExists(starter.templateId)) {
      continue;
    }
    return { starter, chipLabel: chip.label, chipSlug: chip.slug };
  }
  return null;
}

export function shouldOfferStartThis(input: {
  wasAlreadyFilled: boolean;
  dismissedAt?: string | null;
  completeFilled: boolean;
  fromYouEditor?: boolean;
}): boolean {
  if (input.fromYouEditor) {
    return false;
  }
  return input.completeFilled && !input.wasAlreadyFilled && !input.dismissedAt;
}

export function startThisHref(starter: InterestsSimpleStarter) {
  return createChallengeHref({
    mode: 'simple',
    template: starter.templateId,
    src: 'interests',
    days: starter.durationDays,
    freq: String(starter.frequencyPerWeek),
    vis: starter.visibility,
    title: starter.title,
  });
}

export function simpleDraftFromStarter(
  starter: InterestsSimpleStarter,
  now = new Date(),
): SimpleChallengeDraft {
  const base = defaultSimpleDraft(now);
  const type = SIMPLE_TYPES.find((item) => item.value === starter.templateId) ?? SIMPLE_TYPES[0];
  const days = Math.max(starter.durationDays, 1);
  const duration_preset: SimpleDurationPreset = days === 1 ? 1 : days === 7 ? 7 : days === 30 ? 30 : 'custom';
  const frequencyPerWeek = Math.max(starter.frequencyPerWeek, 1);
  const frequency: SimpleFrequency =
    frequencyPerWeek >= 7 ? 'daily' : frequencyPerWeek === 3 ? '3x_week' : 'custom';
  return {
    ...base,
    currency: 'coins',
    buy_in: 0,
    host_budget: 0,
    type: type.value,
    title: starter.title,
    task: type.activity,
    duration_preset,
    duration_days: days,
    frequency,
    custom_checkins: frequencyPerWeek,
    custom_period: 'week',
    scoring: 'consistency',
    visibility: starter.visibility,
  };
}

export function starterFromCreateParams(input: {
  template?: string | null;
  src?: string | null;
  days?: string | null;
  freq?: string | null;
  vis?: string | null;
  title?: string | null;
}): InterestsSimpleStarter | null {
  if (input.src !== 'interests') {
    return null;
  }
  const templateId = String(input.template ?? '').trim();
  if (!simpleTypeExists(templateId)) {
    return null;
  }
  const days = Math.max(Number(input.days) || 7, 1);
  const frequencyPerWeek = Math.max(Number(input.freq) || 3, 1);
  const visibility: SimpleVisibility = input.vis === 'friends' || input.vis === 'invite' ? input.vis : 'public';
  const type = SIMPLE_TYPES.find((item) => item.value === templateId) ?? SIMPLE_TYPES[0];
  return {
    templateId,
    title: String(input.title ?? '').trim() || type.label,
    durationDays: days,
    frequencyPerWeek,
    visibility,
  };
}

export function mealPlanCopyOnCard(text: string): boolean {
  return MEAL_PLAN.test(text);
}
