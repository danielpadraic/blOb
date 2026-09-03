import { clampStanceScore, stanceFromMarks, STANCE_DEFAULT, type ChipStance } from '@/lib/interests';
import {
  QTY_PERIODS,
  QTY_PERIOD_LABELS,
  isDietChip,
  isPlayCard,
  showsGoalQty,
  showsHighestLevel,
  type InterestChipDef,
  type InterestRoomSlug,
  type QtyPeriod,
} from '@/lib/interestsCatalog';

export const RATING_KINDS = ['dupr', 'utr', 'ntrp', 'handicap', 'mmr', 'grade', 'other'] as const;
export type RatingKind = (typeof RATING_KINDS)[number];

export const QTY_KINDS = [
  'pages_week',
  'books_year',
  'miles_outing',
  'sessions_week',
  'fasting_hours',
  'laps',
  'steps_day',
] as const;
export type QtyKind = (typeof QTY_KINDS)[number];

export const PROOF_PREFS = ['honor', 'photo', 'time', 'score', 'fitness_tracker'] as const;
export type PreferredProof = (typeof PROOF_PREFS)[number];

export const INDOOR_OUTDOOR = ['indoor', 'outdoor', 'both'] as const;
export type IndoorOutdoor = (typeof INDOOR_OUTDOOR)[number];

export const ACADEMICS_LEVELS = [
  'middle',
  'high_school',
  'undergrad',
  'grad',
  'trade',
  'continuing',
] as const;
export type AcademicsLevel = (typeof ACADEMICS_LEVELS)[number];

export const ACADEMICS_FOCUSES = [
  'stem',
  'arts',
  'humanities',
  'business',
  'health',
  'trades',
  'other',
] as const;
export type AcademicsFocus = (typeof ACADEMICS_FOCUSES)[number];

export const FASTING_PRACTICES = ['none', 'time_restricted', 'longer_fasts'] as const;
export type FastingPractice = (typeof FASTING_PRACTICES)[number];

export const SPORTS_LEVELS = ['recreational', 'high_school', 'college', 'professional'] as const;
export type SportsLevel = (typeof SPORTS_LEVELS)[number];

export const DIET_GOALS = [
  'weight_loss',
  'body_recomp',
  'building_muscle',
  'maintenance',
  'other',
] as const;
export type DietGoal = (typeof DIET_GOALS)[number];

export const DIET_STYLES = [
  'balanced',
  'low_carb',
  'high_protein',
  'low_fat',
  'high_fat',
  'caloric_deficit',
  'other',
] as const;
export type DietStyle = (typeof DIET_STYLES)[number];

export type QtyBand = {
  kind: QtyKind;
  min: number;
  max: number;
  step: number;
  minLabel: string;
  maxLabel: string;
  unitLabel: string;
};

export const QTY_BANDS: Record<QtyKind, QtyBand> = {
  pages_week: {
    kind: 'pages_week',
    min: 0,
    max: 200,
    step: 1,
    minLabel: '0',
    maxLabel: '200+',
    unitLabel: 'pages',
  },
  books_year: {
    kind: 'books_year',
    min: 0,
    max: 100,
    step: 1,
    minLabel: '0',
    maxLabel: '100+',
    unitLabel: 'books',
  },
  miles_outing: {
    kind: 'miles_outing',
    min: 0,
    max: 20,
    step: 0.5,
    minLabel: '<1',
    maxLabel: '20+',
    unitLabel: 'mi',
  },
  sessions_week: {
    kind: 'sessions_week',
    min: 0,
    max: 14,
    step: 1,
    minLabel: '0',
    maxLabel: '14',
    unitLabel: 'sessions',
  },
  fasting_hours: {
    kind: 'fasting_hours',
    min: 0,
    max: 24,
    step: 0.5,
    minLabel: '0',
    maxLabel: '24',
    unitLabel: 'hours',
  },
  laps: {
    kind: 'laps',
    min: 0,
    max: 100,
    step: 1,
    minLabel: '0',
    maxLabel: '100+',
    unitLabel: 'laps',
  },
  steps_day: {
    kind: 'steps_day',
    min: 0,
    max: 20000,
    step: 500,
    minLabel: '<1,500',
    maxLabel: '20,000+',
    unitLabel: 'steps',
  },
};

export { QTY_PERIODS, QTY_PERIOD_LABELS };

export type ChipFollowUp = {
  stanceScore: number;
  ratingValue: number | null;
  ratingUnknown: boolean;
  currentQty: number | null;
  goalQty: number | null;
  qtyUnknown: boolean;
  qtyPeriod: QtyPeriod | null;
  goalQtyPeriod: QtyPeriod | null;
  indoorOutdoor: IndoorOutdoor | null;
  preferredProof: PreferredProof | null;
  preferredProofs: PreferredProof[];
  mmrLabel: string;
  gradeLabel: string;
  academicsLevel: AcademicsLevel | null;
  academicsFocus: AcademicsFocus | null;
  academicsFocusOther: string;
  fastingPractice: FastingPractice | null;
  highestLevel: SportsLevel | null;
  dietGoals: DietGoal[];
  dietStyles: DietStyle[];
  otherGoalText: string;
  otherDietText: string;
};

export function emptyFollowUp(period: QtyPeriod = 'week'): ChipFollowUp {
  return {
    stanceScore: STANCE_DEFAULT,
    ratingValue: null,
    ratingUnknown: false,
    currentQty: null,
    goalQty: null,
    qtyUnknown: false,
    qtyPeriod: period,
    goalQtyPeriod: period,
    indoorOutdoor: null,
    preferredProof: null,
    preferredProofs: [],
    mmrLabel: '',
    gradeLabel: '',
    academicsLevel: null,
    academicsFocus: null,
    academicsFocusOther: '',
    fastingPractice: null,
    highestLevel: null,
    dietGoals: [],
    dietStyles: [],
    otherGoalText: '',
    otherDietText: '',
  };
}

export function isQtyPeriod(value: string | null | undefined): value is QtyPeriod {
  return Boolean(value && (QTY_PERIODS as readonly string[]).includes(value));
}

export function coerceQtyPeriod(value: string | null | undefined): QtyPeriod {
  if (value === 'session') {
    return 'week';
  }
  return isQtyPeriod(value) ? value : 'week';
}

export function isRatingKind(value: string | null | undefined): value is RatingKind {
  return Boolean(value && (RATING_KINDS as readonly string[]).includes(value));
}

export function isPreferredProof(value: string | null | undefined): value is PreferredProof {
  return Boolean(value && (PROOF_PREFS as readonly string[]).includes(value));
}

export function isSportsLevel(value: string | null | undefined): value is SportsLevel {
  return Boolean(value && (SPORTS_LEVELS as readonly string[]).includes(value));
}

export function isDietGoal(value: string | null | undefined): value is DietGoal {
  return Boolean(value && (DIET_GOALS as readonly string[]).includes(value));
}

export function isDietStyle(value: string | null | undefined): value is DietStyle {
  return Boolean(value && (DIET_STYLES as readonly string[]).includes(value));
}

export function allProofsSelected(proofs: PreferredProof[]): boolean {
  return PROOF_PREFS.every((value) => proofs.includes(value));
}

export function toggleProof(current: ChipFollowUp, value: PreferredProof): ChipFollowUp {
  const has = current.preferredProofs.includes(value);
  const preferredProofs = has
    ? current.preferredProofs.filter((item) => item !== value)
    : [...current.preferredProofs, value];
  return {
    ...current,
    preferredProofs,
    preferredProof: preferredProofs[0] ?? null,
  };
}

export function toggleAllProofs(current: ChipFollowUp): ChipFollowUp {
  if (allProofsSelected(current.preferredProofs)) {
    return { ...current, preferredProofs: [], preferredProof: null };
  }
  return { ...current, preferredProofs: [...PROOF_PREFS], preferredProof: PROOF_PREFS[0] };
}

export function toggleDietGoal(current: ChipFollowUp, value: DietGoal): ChipFollowUp {
  const has = current.dietGoals.includes(value);
  const dietGoals = has ? current.dietGoals.filter((item) => item !== value) : [...current.dietGoals, value];
  return {
    ...current,
    dietGoals,
    otherGoalText: dietGoals.includes('other') ? current.otherGoalText : '',
  };
}

export function toggleDietStyle(current: ChipFollowUp, value: DietStyle): ChipFollowUp {
  const has = current.dietStyles.includes(value);
  const dietStyles = has ? current.dietStyles.filter((item) => item !== value) : [...current.dietStyles, value];
  return {
    ...current,
    dietStyles,
    otherDietText: dietStyles.includes('other') ? current.otherDietText : '',
  };
}

export function qtyUnitLabel(
  kind: QtyKind,
  chipSlug: string,
  units: 'imperial' | 'metric',
): string {
  if (kind === 'laps' || chipSlug === 'swimming') {
    return 'laps';
  }
  if (kind === 'sessions_week' || chipSlug === 'rowing') {
    return 'sessions';
  }
  if (kind === 'steps_day' || chipSlug === 'walking') {
    return 'steps';
  }
  if (kind === 'miles_outing') {
    return units === 'metric' ? 'km' : 'mi';
  }
  return QTY_BANDS[kind].unitLabel;
}

const VOLUME_CURRENT: Record<string, string> = {
  running: 'I currently run',
  walking: 'I currently walk',
  cycling: 'I currently ride',
  lifting: 'I currently lift',
  hiit: 'I currently train HIIT',
  yoga: 'I currently practice yoga',
  mobility: 'I currently do mobility',
  hyrox: 'I currently train Hyrox',
  pilates: 'I currently practice Pilates',
  rowing: 'I currently row',
  swimming: 'I currently swim',
  other: 'I currently do this',
};

const VOLUME_GOAL: Record<string, string> = {
  running: 'My goal is to run',
  walking: 'My goal is to walk',
  cycling: 'My goal is to ride',
  lifting: 'My goal is to lift',
  hiit: 'My goal is to train HIIT',
  yoga: 'My goal is to practice yoga',
  mobility: 'My goal is to do mobility',
  hyrox: 'My goal is to train Hyrox',
  pilates: 'My goal is to practice Pilates',
  rowing: 'My goal is to row',
  swimming: 'My goal is to swim',
  other: 'My goal is to do this',
};

const QTY_VERB: Record<string, string> = {
  running: 'run',
  walking: 'walk',
  cycling: 'ride',
  lifting: 'lift',
  swimming: 'swim',
  rowing: 'row',
  reading: 'read',
  hiking: 'hike',
  writing: 'write',
};

export function currentVolumeLabel(chip: InterestChipDef): string {
  return VOLUME_CURRENT[chip.slug] ?? (QTY_VERB[chip.slug] ? `I currently ${QTY_VERB[chip.slug]}` : 'I currently do this');
}

export function goalVolumeLabel(chip: InterestChipDef): string {
  return VOLUME_GOAL[chip.slug] ?? (QTY_VERB[chip.slug] ? `My goal is to ${QTY_VERB[chip.slug]}` : 'My goal is to do this');
}

export function qtyRequiredLine(chip: InterestChipDef): string {
  const verb = QTY_VERB[chip.slug];
  if (verb) {
    return `Add how often you ${verb}.`;
  }
  return `Add how often you do ${chip.label.toLowerCase()}.`;
}

export function activityCardBlocked(input: {
  chip: InterestChipDef;
  followUp: ChipFollowUp;
  room?: InterestRoomSlug;
  occupation?: string;
  employer?: string;
  otherText?: string;
}): string | null {
  const { chip, followUp } = input;
  const room = input.room;
  if (chip.isWork && (!String(input.occupation ?? '').trim() || !String(input.employer ?? '').trim())) {
    return 'Add occupation and employer for Work.';
  }
  if (chip.isOther && !String(input.otherText ?? '').trim()) {
    return 'Add a short note for Other.';
  }
  if (chip.slug === 'academics') {
    if (!followUp.academicsLevel || !followUp.academicsFocus) {
      return 'Add your level and focus.';
    }
    if (followUp.academicsFocus === 'other' && !followUp.academicsFocusOther.trim()) {
      return 'Add a short note for Other.';
    }
  }
  if (isDietChip(chip.slug)) {
    if (followUp.dietGoals.length === 0) {
      return 'Add your nutrition goals.';
    }
    if (followUp.dietGoals.includes('other') && !followUp.otherGoalText.trim()) {
      return 'Add a short note for Other.';
    }
    if (followUp.dietStyles.length === 0) {
      return 'Add your current diet.';
    }
    if (followUp.dietStyles.includes('other') && !followUp.otherDietText.trim()) {
      return 'Add a short note for Other.';
    }
    return null;
  }
  if (chip.slug === 'fasting') {
    if (!followUp.fastingPractice) {
      return 'Add how you fast, or Unknown.';
    }
    if (!followUp.qtyUnknown && (followUp.currentQty == null || followUp.goalQty == null)) {
      return 'Add hours, or Unknown.';
    }
  }
  const ratingKind = isRatingKind(chip.ratingKind) ? chip.ratingKind : null;
  if (ratingKind && !followUp.ratingUnknown) {
    if (ratingKind === 'mmr' && !followUp.mmrLabel.trim()) {
      return 'Add rank, or Unknown.';
    }
    if (ratingKind === 'grade' && !followUp.gradeLabel.trim()) {
      return 'Add grade, or Unknown.';
    }
    if (ratingKind !== 'mmr' && ratingKind !== 'grade' && followUp.ratingValue == null) {
      return `Add your ${RATING_LABELS[ratingKind]}, or Unknown.`;
    }
  }
  const qtyKind = isQtyKind(chip.qtyKind) ? chip.qtyKind : null;
  const play = room ? isPlayCard(room) : false;
  const qtyRequired = Boolean(qtyKind) && !chip.isOther && chip.slug !== 'fasting';
  if (qtyRequired && qtyKind) {
    if (followUp.currentQty == null || !followUp.qtyPeriod) {
      return play ? 'Add how often you play.' : qtyRequiredLine(chip);
    }
    if (room && showsGoalQty(room, chip) && followUp.goalQty != null && !followUp.goalQtyPeriod) {
      return qtyRequiredLine(chip);
    }
  }
  if (room && showsHighestLevel(room) && !followUp.highestLevel) {
    return 'Add the highest level you’ve played.';
  }
  return null;
}

export function isQtyKind(value: string | null | undefined): value is QtyKind {
  return Boolean(value && (QTY_KINDS as readonly string[]).includes(value));
}

export function clampQty(kind: QtyKind, value: number): number {
  const band = QTY_BANDS[kind];
  const stepped = Math.round(value / band.step) * band.step;
  const rounded = band.step < 1 ? Number(stepped.toFixed(1)) : Math.round(stepped);
  return Math.min(band.max, Math.max(band.min, rounded));
}

export function parseRatingInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function setRatingUnknown(current: ChipFollowUp, unknown: boolean): ChipFollowUp {
  if (unknown) {
    return { ...current, ratingUnknown: true, ratingValue: null };
  }
  return { ...current, ratingUnknown: false };
}

export function setRatingValue(current: ChipFollowUp, raw: string): ChipFollowUp {
  const parsed = parseRatingInput(raw);
  return { ...current, ratingUnknown: false, ratingValue: parsed };
}

export function setQtyUnknown(current: ChipFollowUp, unknown: boolean): ChipFollowUp {
  if (unknown) {
    return { ...current, qtyUnknown: true, currentQty: null, goalQty: null };
  }
  return { ...current, qtyUnknown: false };
}

export function setQtyValue(
  current: ChipFollowUp,
  kind: QtyKind,
  field: 'currentQty' | 'goalQty',
  value: number,
): ChipFollowUp {
  const next = { ...current, qtyUnknown: false, [field]: clampQty(kind, value) };
  if (field === 'currentQty' && current.goalQty == null) {
    return { ...next, goalQty: clampQty(kind, value) };
  }
  return next;
}

export function setQtyPeriod(current: ChipFollowUp, period: QtyPeriod): ChipFollowUp {
  return { ...current, qtyPeriod: period };
}

export function setGoalQtyPeriod(current: ChipFollowUp, period: QtyPeriod): ChipFollowUp {
  return { ...current, goalQtyPeriod: period };
}

export function pruneFollowUps(
  followUps: Record<string, ChipFollowUp>,
  stances: Record<string, ChipStance>,
): Record<string, ChipFollowUp> {
  const next: Record<string, ChipFollowUp> = {};
  for (const slug of Object.keys(stances)) {
    if (followUps[slug]) {
      next[slug] = followUps[slug];
    }
  }
  return next;
}

export function ensureFollowUp(
  followUps: Record<string, ChipFollowUp>,
  slug: string,
): Record<string, ChipFollowUp> {
  if (followUps[slug]) {
    return followUps;
  }
  return { ...followUps, [slug]: emptyFollowUp() };
}

export function dropFollowUp(
  followUps: Record<string, ChipFollowUp>,
  slug: string,
): Record<string, ChipFollowUp> {
  if (!followUps[slug]) {
    return followUps;
  }
  const next = { ...followUps };
  delete next[slug];
  return next;
}

export type FollowUpExtras = {
  mmr_label?: string;
  grade_label?: string;
  academics_level?: AcademicsLevel;
  academics_focus?: AcademicsFocus;
  academics_focus_other?: string;
  fasting_practice?: FastingPractice;
  fasting_hours_unknown?: boolean;
  highest_level?: SportsLevel;
  goals?: DietGoal[];
  diet?: DietStyle[];
  other_goal_text?: string;
  other_diet_text?: string;
};

export function extrasFromFollowUp(input: {
  followUp: ChipFollowUp;
  slug: string;
  ratingKind: string | null;
  qtyKind: string | null;
  room?: InterestRoomSlug;
}): FollowUpExtras {
  const extras: FollowUpExtras = {};
  const { followUp, slug, ratingKind, qtyKind, room } = input;
  if (ratingKind === 'mmr' && followUp.mmrLabel.trim()) {
    extras.mmr_label = followUp.mmrLabel.trim();
  }
  if (ratingKind === 'grade' && followUp.gradeLabel.trim()) {
    extras.grade_label = followUp.gradeLabel.trim();
  }
  if (slug === 'academics') {
    if (followUp.academicsLevel) {
      extras.academics_level = followUp.academicsLevel;
    }
    if (followUp.academicsFocus) {
      extras.academics_focus = followUp.academicsFocus;
    }
    if (followUp.academicsFocus === 'other' && followUp.academicsFocusOther.trim()) {
      extras.academics_focus_other = followUp.academicsFocusOther.trim();
    }
  }
  if (slug === 'fasting') {
    if (followUp.fastingPractice) {
      extras.fasting_practice = followUp.fastingPractice;
    }
    if (qtyKind === 'fasting_hours' && followUp.qtyUnknown) {
      extras.fasting_hours_unknown = true;
    }
  }
  if (room && showsHighestLevel(room) && followUp.highestLevel) {
    extras.highest_level = followUp.highestLevel;
  }
  if (isDietChip(slug)) {
    extras.goals = followUp.dietGoals;
    extras.diet = followUp.dietStyles;
    if (followUp.dietGoals.includes('other') && followUp.otherGoalText.trim()) {
      extras.other_goal_text = followUp.otherGoalText.trim();
    }
    if (followUp.dietStyles.includes('other') && followUp.otherDietText.trim()) {
      extras.other_diet_text = followUp.otherDietText.trim();
    }
  }
  return extras;
}

export function coerceFollowUpForChip(chip: InterestChipDef, followUp: ChipFollowUp): ChipFollowUp {
  if (chip.qtyKind !== 'steps_day') {
    return followUp;
  }
  const staleMiles = (value: number | null) => value != null && value <= 25;
  return {
    ...followUp,
    qtyPeriod: 'day',
    goalQtyPeriod: 'day',
    currentQty: staleMiles(followUp.currentQty) ? null : followUp.currentQty,
    goalQty: staleMiles(followUp.goalQty) ? null : followUp.goalQty,
  };
}

export function followUpFromRow(row: {
  stance_score?: number | string | null;
  excel?: boolean | null;
  level_up?: boolean | null;
  rating_value?: number | string | null;
  rating_unknown?: boolean | null;
  current_qty?: number | string | null;
  goal_qty?: number | string | null;
  qty_period?: string | null;
  goal_qty_period?: string | null;
  indoor_outdoor?: string | null;
  preferred_proof?: string | null;
  preferred_proofs?: string[] | null;
  extras?: unknown;
}): ChipFollowUp {
  const extras = (row.extras ?? {}) as FollowUpExtras;
  const indoor = INDOOR_OUTDOOR.includes(row.indoor_outdoor as IndoorOutdoor)
    ? (row.indoor_outdoor as IndoorOutdoor)
    : null;
  const storedProofs = (row.preferred_proofs ?? []).filter(isPreferredProof);
  const legacyProof = isPreferredProof(row.preferred_proof) ? row.preferred_proof : null;
  const preferredProofs = storedProofs.length > 0 ? storedProofs : legacyProof ? [legacyProof] : [];
  const level = ACADEMICS_LEVELS.includes(extras.academics_level as AcademicsLevel)
    ? (extras.academics_level as AcademicsLevel)
    : null;
  const focus = ACADEMICS_FOCUSES.includes(extras.academics_focus as AcademicsFocus)
    ? (extras.academics_focus as AcademicsFocus)
    : null;
  const practice = FASTING_PRACTICES.includes(extras.fasting_practice as FastingPractice)
    ? (extras.fasting_practice as FastingPractice)
    : null;
  const ratingValue =
    row.rating_value == null || row.rating_value === '' ? null : Number(row.rating_value);
  const currentQty = row.current_qty == null || row.current_qty === '' ? null : Number(row.current_qty);
  const goalQty = row.goal_qty == null || row.goal_qty === '' ? null : Number(row.goal_qty);
  const rawScore = row.stance_score == null || row.stance_score === '' ? null : Number(row.stance_score);
  const stanceScore = stanceFromMarks(
    Boolean(row.excel),
    Boolean(row.level_up),
    rawScore != null && Number.isFinite(rawScore) ? rawScore : null,
  );
  const dietGoals = Array.isArray(extras.goals) ? extras.goals.filter(isDietGoal) : [];
  const dietStyles = Array.isArray(extras.diet) ? extras.diet.filter(isDietStyle) : [];
  return {
    stanceScore,
    ratingValue: Number.isFinite(ratingValue) ? ratingValue : null,
    ratingUnknown: Boolean(row.rating_unknown),
    currentQty: Number.isFinite(currentQty) ? currentQty : null,
    goalQty: Number.isFinite(goalQty) ? goalQty : null,
    qtyUnknown: Boolean(extras.fasting_hours_unknown),
    qtyPeriod: coerceQtyPeriod(row.qty_period),
    goalQtyPeriod: coerceQtyPeriod(row.goal_qty_period ?? row.qty_period),
    indoorOutdoor: indoor,
    preferredProof: preferredProofs[0] ?? null,
    preferredProofs,
    mmrLabel: String(extras.mmr_label ?? ''),
    gradeLabel: String(extras.grade_label ?? ''),
    academicsLevel: level,
    academicsFocus: focus,
    academicsFocusOther: String(extras.academics_focus_other ?? ''),
    fastingPractice: practice,
    highestLevel: isSportsLevel(extras.highest_level) ? extras.highest_level : null,
    dietGoals,
    dietStyles,
    otherGoalText: String(extras.other_goal_text ?? ''),
    otherDietText: String(extras.other_diet_text ?? ''),
  };
}

export function savePayload(input: {
  followUp: ChipFollowUp;
  slug: string;
  ratingKind: string | null;
  qtyKind: string | null;
  allowsIndoorOutdoor: boolean;
  room?: InterestRoomSlug;
}): {
  stance_score: number;
  rating_value: number | null;
  rating_unknown: boolean;
  current_qty: number | null;
  goal_qty: number | null;
  qty_period: QtyPeriod | null;
  goal_qty_period: QtyPeriod | null;
  indoor_outdoor: IndoorOutdoor | null;
  preferred_proof: PreferredProof | null;
  preferred_proofs: PreferredProof[];
  extras: FollowUpExtras;
} {
  const extras = extrasFromFollowUp(input);
  const ratingUnknown = Boolean(input.ratingKind) && input.followUp.ratingUnknown;
  const proofs = input.followUp.preferredProofs.filter(isPreferredProof);
  const score = clampStanceScore(input.followUp.stanceScore || STANCE_DEFAULT);
  const hasQty = Boolean(input.qtyKind) && !input.followUp.qtyUnknown;
  const storeGoal =
    hasQty &&
    input.qtyKind !== 'fasting_hours' &&
    (!input.room ||
      showsGoalQty(input.room, {
        slug: input.slug,
        label: input.slug,
        allowsIndoorOutdoor: false,
        ratingKind: null,
        qtyKind: isQtyKind(input.qtyKind) ? input.qtyKind : null,
      }));
  const currentQty = hasQty ? input.followUp.currentQty : null;
  const goalQty = !hasQty
    ? null
    : input.qtyKind === 'fasting_hours'
      ? input.followUp.goalQty
      : storeGoal
        ? (input.followUp.goalQty ?? input.followUp.currentQty)
        : null;
  const dayOnly = input.qtyKind === 'steps_day' || input.slug === 'walking';
  return {
    stance_score: score,
    rating_value: ratingUnknown || !input.ratingKind ? null : input.followUp.ratingValue,
    rating_unknown: ratingUnknown,
    current_qty: currentQty,
    goal_qty: goalQty,
    qty_period: !input.qtyKind ? null : dayOnly ? 'day' : input.followUp.qtyPeriod,
    goal_qty_period: !storeGoal ? null : dayOnly ? 'day' : (input.followUp.goalQtyPeriod ?? input.followUp.qtyPeriod),
    indoor_outdoor: null,
    preferred_proof: proofs[0] ?? null,
    preferred_proofs: proofs,
    extras,
  };
}

export const RATING_LABELS: Record<RatingKind, string> = {
  dupr: 'DUPR',
  utr: 'UTR',
  ntrp: 'NTRP',
  handicap: 'Handicap',
  mmr: 'MMR',
  grade: 'Grade',
  other: 'Rating',
};

export const PROOF_LABELS: Record<PreferredProof, string> = {
  honor: 'Honor',
  photo: 'Photo',
  time: 'Time',
  score: 'Score',
  fitness_tracker: 'Fitness Tracker',
};

export const ACADEMICS_LEVEL_LABELS: Record<AcademicsLevel, string> = {
  middle: 'Middle',
  high_school: 'High school',
  undergrad: 'Undergrad',
  grad: 'Grad',
  trade: 'Trade',
  continuing: 'Continuing',
};

export const ACADEMICS_FOCUS_LABELS: Record<AcademicsFocus, string> = {
  stem: 'STEM',
  arts: 'Arts',
  humanities: 'Humanities',
  business: 'Business',
  health: 'Health',
  trades: 'Trades',
  other: 'Other',
};

export const FASTING_PRACTICE_LABELS: Record<FastingPractice, string> = {
  none: 'None',
  time_restricted: 'Time-restricted',
  longer_fasts: 'Longer fasts',
};

export const INDOOR_LABELS: Record<IndoorOutdoor, string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  both: 'Both',
};

export const SPORTS_LEVEL_LABELS: Record<SportsLevel, string> = {
  recreational: 'Recreational',
  high_school: 'High school',
  college: 'College',
  professional: 'Professional',
};

export const DIET_GOAL_LABELS: Record<DietGoal, string> = {
  weight_loss: 'Weight loss',
  body_recomp: 'Body recomposition',
  building_muscle: 'Building muscle',
  maintenance: 'Maintenance',
  other: 'Other',
};

export const DIET_STYLE_LABELS: Record<DietStyle, string> = {
  balanced: 'Balanced',
  low_carb: 'Low carb',
  high_protein: 'High protein',
  low_fat: 'Low fat',
  high_fat: 'High fat',
  caloric_deficit: 'Caloric deficit',
  other: 'Other',
};
