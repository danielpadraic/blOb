import {
  INTEREST_ROOM_SLUGS,
  NONE_CHIP_SLUG,
  type InterestRoomSlug,
  type InterestRoomState,
} from '@/lib/interestsCatalog';

export type ChipStance = {
  excel: boolean;
  levelUp: boolean;
};

export type RoomSaveAction = 'skip' | 'none' | 'select' | 'card';

export function isRoomComplete(state: InterestRoomState | null | undefined): boolean {
  return state === 'complete_empty' || state === 'complete_filled';
}

export function roomsNeedYouDot(input: {
  dismissedHome?: string | null;
  prompted?: string | null;
  states: Partial<Record<InterestRoomSlug, InterestRoomState>>;
}): boolean {
  if (!input.dismissedHome && !input.prompted) {
    return false;
  }
  return INTEREST_ROOM_SLUGS.some((slug) => !isRoomComplete(input.states[slug]));
}

export function allRoomsComplete(states: Partial<Record<InterestRoomSlug, InterestRoomState>>): boolean {
  return INTEREST_ROOM_SLUGS.every((slug) => isRoomComplete(states[slug]));
}

/** One week between Home reminders to finish incomplete Interests rooms. */
export const INTERESTS_WEEKLY_NUDGE_MS = 7 * 24 * 60 * 60 * 1000;

export function latestTimestamp(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) {
      continue;
    }
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && ms >= bestMs) {
      best = value;
      bestMs = ms;
    }
  }
  return best;
}

export function interestsWeeklyNudgeDue(input: {
  dismissedHome?: string | null;
  lastNudge?: string | null;
  nowMs?: number;
  states: Partial<Record<InterestRoomSlug, InterestRoomState>>;
}): boolean {
  if (!input.dismissedHome) {
    return false;
  }
  if (allRoomsComplete(input.states)) {
    return false;
  }
  const last = latestTimestamp(input.lastNudge, input.dismissedHome);
  const lastMs = last ? Date.parse(last) : Number.NaN;
  if (!Number.isFinite(lastMs)) {
    return true;
  }
  return (input.nowMs ?? Date.now()) - lastMs >= INTERESTS_WEEKLY_NUDGE_MS;
}

/** 50-point skill scale. 1 = full left (Level Up), 50 = full right (Excel). Default 25. */
export const STANCE_MIN = 1;
export const STANCE_MAX = 50;
export const STANCE_DEFAULT = 25;

export function clampStanceScore(value: number): number {
  if (!Number.isFinite(value)) {
    return STANCE_DEFAULT;
  }
  const clamped = Math.min(STANCE_MAX, Math.max(STANCE_MIN, value));
  return Math.round(clamped * 100) / 100;
}

/** Horizontal stance track. Does not snap to whole points. */
export function stanceFromTrack(t: number): number {
  const unit = Math.min(Math.max(t, 0), 1);
  return clampStanceScore(STANCE_MIN + unit * (STANCE_MAX - STANCE_MIN));
}

/** @deprecated Use stanceFromTrack. Left/top t=0 is score 1. */
export function stanceFromTrackTop(t: number): number {
  return stanceFromTrack(t);
}

export const CARD_SLIDE_MS = 300;

export type ActivityCardPage = 1 | 2;

/** Flat pager index: two pages per selected chip. */
export function activityWizardPagerIndex(chipIndex: number, page: ActivityCardPage): number {
  return Math.max(chipIndex, 0) * 2 + (page === 2 ? 1 : 0);
}

/**
 * One progress segment per selected interest.
 * Segment i fills only after that chip’s page 2 is submitted (Continue off page 2).
 * Viewing chip i on page 1 or 2 does not fill segment i.
 */
export function activityProgressFilled(chipIndex: number, _page: ActivityCardPage): number {
  return Math.max(chipIndex, 0);
}

export type ActivityWizardPos = {
  chipIndex: number;
  page: ActivityCardPage;
};

export type ActivityWizardContinue =
  | { kind: 'page'; chipIndex: number; page: ActivityCardPage }
  | { kind: 'done' };

export type ActivityWizardBack =
  | { kind: 'page'; chipIndex: number; page: ActivityCardPage }
  | { kind: 'picker' };

/** Continue: page 1 → page 2 of this chip; page 2 → next chip page 1, or finish the room. */
export function activityWizardContinue(pos: ActivityWizardPos, chipCount: number): ActivityWizardContinue {
  if (pos.page === 1) {
    return { kind: 'page', chipIndex: pos.chipIndex, page: 2 };
  }
  if (pos.chipIndex < chipCount - 1) {
    return { kind: 'page', chipIndex: pos.chipIndex + 1, page: 1 };
  }
  return { kind: 'done' };
}

/** Back: page 2 → page 1 of this chip; page 1 → previous chip page 2, or the room picker. */
export function activityWizardBack(pos: ActivityWizardPos): ActivityWizardBack {
  if (pos.page === 2) {
    return { kind: 'page', chipIndex: pos.chipIndex, page: 1 };
  }
  if (pos.chipIndex > 0) {
    return { kind: 'page', chipIndex: pos.chipIndex - 1, page: 2 };
  }
  return { kind: 'picker' };
}

/** 1–20 level_up, 21–30 both, 31–50 excel. */
export function stanceMarks(score: number): ChipStance {
  const clamped = clampStanceScore(score);
  if (clamped <= 20) {
    return { excel: false, levelUp: true };
  }
  if (clamped >= 31) {
    return { excel: true, levelUp: false };
  }
  return { excel: true, levelUp: true };
}

export function stanceFromMarks(
  excel: boolean,
  levelUp: boolean,
  score?: number | null,
): number {
  if (score != null && Number.isFinite(score) && score >= STANCE_MIN && score <= STANCE_MAX) {
    return clampStanceScore(score);
  }
  if (excel && levelUp) {
    return STANCE_DEFAULT;
  }
  if (excel) {
    return 40;
  }
  if (levelUp) {
    return 10;
  }
  return STANCE_DEFAULT;
}

export function toggleChipStance(
  current: Record<string, ChipStance>,
  chipId: string,
): Record<string, ChipStance> {
  if (current[chipId]) {
    const next = { ...current };
    delete next[chipId];
    return next;
  }
  return { ...current, [chipId]: stanceMarks(STANCE_DEFAULT) };
}

export function setChipMark(
  current: Record<string, ChipStance>,
  chipId: string,
  mark: 'excel' | 'levelUp',
): Record<string, ChipStance> {
  const row = current[chipId] ?? stanceMarks(STANCE_DEFAULT);
  const next = { ...row, [mark]: !row[mark] };
  if (!next.excel && !next.levelUp) {
    next[mark] = true;
  }
  return { ...current, [chipId]: next };
}

export type RoomPickerChoice = {
  selected: Record<string, ChipStance>;
  noneOfThese: boolean;
};

export function toggleRoomPickerChip(
  current: RoomPickerChoice,
  slug: string,
): RoomPickerChoice {
  if (slug === NONE_CHIP_SLUG) {
    return { selected: {}, noneOfThese: true };
  }
  const selected = toggleChipStance(current.selected, slug);
  return { selected, noneOfThese: false };
}

export function roomContinueBlocked(input: RoomPickerChoice): string | null {
  if (input.noneOfThese) {
    return null;
  }
  if (Object.keys(input.selected).length === 0) {
    return 'Pick a chip, or None of these.';
  }
  return null;
}

export function continueBlocked(input: {
  stances: Record<string, ChipStance>;
  workOn: boolean;
  occupation: string;
  employer: string;
  otherOn: boolean;
  otherText: string;
  noneOfThese?: boolean;
}): string | null {
  if (input.noneOfThese) {
    return null;
  }
  if (Object.keys(input.stances).length === 0) {
    return 'Pick a chip, or None of these.';
  }
  if (input.workOn && (!input.occupation.trim() || !input.employer.trim())) {
    return 'Add occupation and employer for Work.';
  }
  if (input.otherOn && !input.otherText.trim()) {
    return 'Add a short note for Other.';
  }
  return null;
}

export function stateForSave(
  action: RoomSaveAction,
  chipCount: number,
  completeRoom = false,
): InterestRoomState {
  if (action === 'skip' || action === 'select' || (action === 'card' && !completeRoom)) {
    return 'incomplete';
  }
  if (action === 'none' || chipCount === 0) {
    return 'complete_empty';
  }
  return 'complete_filled';
}

export const INTEREST_ROOM_COINS = 10;
