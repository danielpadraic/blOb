import type { ChipStance } from '@/lib/interests';
import type { InterestChipDef, QtyPeriod } from '@/lib/interestsCatalog';

export const RATING_KINDS = ['dupr', 'utr', 'ntrp', 'handicap', 'mmr', 'grade', 'other'] as const;
export type RatingKind = (typeof RATING_KINDS)[number];

export const QTY_KINDS = [
  'pages_week',
  'books_year',
  'miles_outing',
  'sessions_week',
  'fasting_hours',
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
};

export const QTY_PERIODS = ['session', 'day', 'week', 'month', 'year'] as const;

export const QTY_PERIOD_LABELS: Record<QtyPeriod, string> = {
  session: 'Per session',
  day: 'Per day',
  week: 'Per week',
  month: 'Per month',
  year: 'Per year',
};

export type ChipFollowUp = {
  stanceScore: number;
  ratingValue: number | null;
  ratingUnknown: boolean;
  currentQty: number | null;
  goalQty: number | null;
  qtyUnknown: boolean;
  qtyPeriod: QtyPeriod | null;
  indoorOutdoor: IndoorOutdoor | null;
  preferredProof: PreferredProof | null;
  preferredProofs: PreferredProof[];
  mmrLabel: string;
  gradeLabel: string;
  academicsLevel: AcademicsLevel | null;
  academicsFocus: AcademicsFocus | null;
  academicsFocusOther: string;
  fastingPractice: FastingPractice | null;
};

export function emptyFollowUp(period: QtyPeriod = 'week'): ChipFollowUp {
  return {
    stanceScore: 3,
    ratingValue: null,
    ratingUnknown: false,
    currentQty: null,
    goalQty: null,
    qtyUnknown: false,
    qtyPeriod: period,
    indoorOutdoor: null,
    preferredProof: null,
    preferredProofs: [],
    mmrLabel: '',
    gradeLabel: '',
    academicsLevel: null,
    academicsFocus: null,
    academicsFocusOther: '',
    fastingPractice: null,
  };
}

export function isQtyPeriod(value: string | null | undefined): value is QtyPeriod {
  return Boolean(value && (QTY_PERIODS as readonly string[]).includes(value));
}

export function isRatingKind(value: string | null | undefined): value is RatingKind {
  return Boolean(value && (RATING_KINDS as readonly string[]).includes(value));
}

export function isPreferredProof(value: string | null | undefined): value is PreferredProof {
  return Boolean(value && (PROOF_PREFS as readonly string[]).includes(value));
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

export function qtyUnitLabel(
  kind: QtyKind,
  chipSlug: string,
  units: 'imperial' | 'metric',
): string {
  if (kind === 'miles_outing') {
    if (chipSlug === 'swimming') {
      return units === 'metric' ? 'meters' : 'yards';
    }
    if (chipSlug === 'rowing') {
      return 'meters';
    }
    return units === 'metric' ? 'km' : 'mi';
  }
  return QTY_BANDS[kind].unitLabel;
}

const QTY_VERB: Record<string, string> = {
  running: 'run',
  walking: 'walk',
  cycling: 'cycle',
  lifting: 'lift',
  swimming: 'swim',
  rowing: 'row',
  reading: 'read',
  hiking: 'hike',
  writing: 'write',
};

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
  occupation?: string;
  employer?: string;
  otherText?: string;
}): string | null {
  const { chip, followUp } = input;
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
  const qtyRequired = Boolean(qtyKind) && !chip.isOther && chip.slug !== 'fasting';
  if (qtyRequired && qtyKind) {
    if (followUp.currentQty == null || followUp.goalQty == null) {
      return qtyRequiredLine(chip);
    }
    if (!followUp.qtyPeriod) {
      return qtyRequiredLine(chip);
    }
  }
  if (chip.allowsIndoorOutdoor && !followUp.indoorOutdoor) {
    return 'Pick Indoor, Outdoor, or Both.';
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
  return { ...current, qtyUnknown: false, [field]: clampQty(kind, value) };
}

export function setQtyPeriod(current: ChipFollowUp, period: QtyPeriod): ChipFollowUp {
  return { ...current, qtyPeriod: period };
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
};

export function extrasFromFollowUp(input: {
  followUp: ChipFollowUp;
  slug: string;
  ratingKind: string | null;
  qtyKind: string | null;
}): FollowUpExtras {
  const extras: FollowUpExtras = {};
  const { followUp, slug, ratingKind, qtyKind } = input;
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
  return extras;
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
  const stanceScore =
    rawScore != null && Number.isFinite(rawScore)
      ? Math.min(5, Math.max(1, Math.round(rawScore)))
      : row.excel && row.level_up
        ? 3
        : row.excel
          ? 2
          : row.level_up
            ? 4
            : 3;
  return {
    stanceScore,
    ratingValue: Number.isFinite(ratingValue) ? ratingValue : null,
    ratingUnknown: Boolean(row.rating_unknown),
    currentQty: Number.isFinite(currentQty) ? currentQty : null,
    goalQty: Number.isFinite(goalQty) ? goalQty : null,
    qtyUnknown: Boolean(extras.fasting_hours_unknown),
    qtyPeriod: isQtyPeriod(row.qty_period) ? row.qty_period : 'week',
    indoorOutdoor: indoor,
    preferredProof: preferredProofs[0] ?? null,
    preferredProofs,
    mmrLabel: String(extras.mmr_label ?? ''),
    gradeLabel: String(extras.grade_label ?? ''),
    academicsLevel: level,
    academicsFocus: focus,
    academicsFocusOther: String(extras.academics_focus_other ?? ''),
    fastingPractice: practice,
  };
}

export function savePayload(input: {
  followUp: ChipFollowUp;
  slug: string;
  ratingKind: string | null;
  qtyKind: string | null;
  allowsIndoorOutdoor: boolean;
}): {
  stance_score: number;
  rating_value: number | null;
  rating_unknown: boolean;
  current_qty: number | null;
  goal_qty: number | null;
  qty_period: QtyPeriod | null;
  indoor_outdoor: IndoorOutdoor | null;
  preferred_proof: PreferredProof | null;
  preferred_proofs: PreferredProof[];
  extras: FollowUpExtras;
} {
  const extras = extrasFromFollowUp(input);
  const ratingUnknown = Boolean(input.ratingKind) && input.followUp.ratingUnknown;
  const proofs = input.followUp.preferredProofs.filter(isPreferredProof);
  const score = Math.min(5, Math.max(1, Math.round(input.followUp.stanceScore || 3)));
  return {
    stance_score: score,
    rating_value: ratingUnknown || !input.ratingKind ? null : input.followUp.ratingValue,
    rating_unknown: ratingUnknown,
    current_qty: input.qtyKind && !input.followUp.qtyUnknown ? input.followUp.currentQty : null,
    goal_qty: input.qtyKind && !input.followUp.qtyUnknown ? input.followUp.goalQty : null,
    qty_period: input.qtyKind ? input.followUp.qtyPeriod : null,
    indoor_outdoor: input.allowsIndoorOutdoor ? input.followUp.indoorOutdoor : null,
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
