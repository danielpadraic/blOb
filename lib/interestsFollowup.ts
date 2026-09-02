import type { ChipStance } from '@/lib/interests';

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
    unitLabel: 'pages/week',
  },
  books_year: {
    kind: 'books_year',
    min: 0,
    max: 100,
    step: 1,
    minLabel: '0',
    maxLabel: '100+',
    unitLabel: 'books/year',
  },
  miles_outing: {
    kind: 'miles_outing',
    min: 0,
    max: 20,
    step: 0.5,
    minLabel: '<1',
    maxLabel: '20+',
    unitLabel: 'miles',
  },
  sessions_week: {
    kind: 'sessions_week',
    min: 0,
    max: 14,
    step: 1,
    minLabel: '0',
    maxLabel: '14',
    unitLabel: 'sessions/week',
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

export type ChipFollowUp = {
  ratingValue: number | null;
  ratingUnknown: boolean;
  currentQty: number | null;
  goalQty: number | null;
  qtyUnknown: boolean;
  indoorOutdoor: IndoorOutdoor | null;
  preferredProof: PreferredProof | null;
  mmrLabel: string;
  gradeLabel: string;
  academicsLevel: AcademicsLevel | null;
  academicsFocus: AcademicsFocus | null;
  academicsFocusOther: string;
  fastingPractice: FastingPractice | null;
};

export function emptyFollowUp(): ChipFollowUp {
  return {
    ratingValue: null,
    ratingUnknown: false,
    currentQty: null,
    goalQty: null,
    qtyUnknown: false,
    indoorOutdoor: null,
    preferredProof: null,
    mmrLabel: '',
    gradeLabel: '',
    academicsLevel: null,
    academicsFocus: null,
    academicsFocusOther: '',
    fastingPractice: null,
  };
}

export function isRatingKind(value: string | null | undefined): value is RatingKind {
  return Boolean(value && (RATING_KINDS as readonly string[]).includes(value));
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
  rating_value?: number | string | null;
  rating_unknown?: boolean | null;
  current_qty?: number | string | null;
  goal_qty?: number | string | null;
  indoor_outdoor?: string | null;
  preferred_proof?: string | null;
  extras?: unknown;
}): ChipFollowUp {
  const extras = (row.extras ?? {}) as FollowUpExtras;
  const indoor = INDOOR_OUTDOOR.includes(row.indoor_outdoor as IndoorOutdoor)
    ? (row.indoor_outdoor as IndoorOutdoor)
    : null;
  const proof = PROOF_PREFS.includes(row.preferred_proof as PreferredProof)
    ? (row.preferred_proof as PreferredProof)
    : null;
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
  return {
    ratingValue: Number.isFinite(ratingValue) ? ratingValue : null,
    ratingUnknown: Boolean(row.rating_unknown),
    currentQty: Number.isFinite(currentQty) ? currentQty : null,
    goalQty: Number.isFinite(goalQty) ? goalQty : null,
    qtyUnknown: Boolean(extras.fasting_hours_unknown),
    indoorOutdoor: indoor,
    preferredProof: proof,
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
  rating_value: number | null;
  rating_unknown: boolean;
  current_qty: number | null;
  goal_qty: number | null;
  indoor_outdoor: IndoorOutdoor | null;
  preferred_proof: PreferredProof | null;
  extras: FollowUpExtras;
} {
  const extras = extrasFromFollowUp(input);
  const ratingUnknown = Boolean(input.ratingKind) && input.followUp.ratingUnknown;
  return {
    rating_value: ratingUnknown || !input.ratingKind ? null : input.followUp.ratingValue,
    rating_unknown: ratingUnknown,
    current_qty: input.qtyKind && !input.followUp.qtyUnknown ? input.followUp.currentQty : null,
    goal_qty: input.qtyKind && !input.followUp.qtyUnknown ? input.followUp.goalQty : null,
    indoor_outdoor: input.allowsIndoorOutdoor ? input.followUp.indoorOutdoor : null,
    preferred_proof: input.followUp.preferredProof,
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
