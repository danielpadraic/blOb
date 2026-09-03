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

export function clampStanceScore(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

/** Horizontal stance track: 1 = full left (Leveling up), 5 = full right (Excel). Default 3. */
export function stanceFromTrack(t: number): number {
  return clampStanceScore(t * 4 + 1);
}

/** @deprecated Use stanceFromTrack. Left/top t=0 is score 1. */
export function stanceFromTrackTop(t: number): number {
  return stanceFromTrack(t);
}

export const CARD_SLIDE_MS = 300;

/** 1–2 level_up, 3 both, 4–5 excel. */
export function stanceMarks(score: number): ChipStance {
  const clamped = clampStanceScore(score);
  if (clamped <= 2) {
    return { excel: false, levelUp: true };
  }
  if (clamped >= 4) {
    return { excel: true, levelUp: false };
  }
  return { excel: true, levelUp: true };
}

export function stanceFromMarks(
  excel: boolean,
  levelUp: boolean,
  score?: number | null,
): number {
  if (score != null && Number.isFinite(score) && score >= 1 && score <= 5) {
    return clampStanceScore(score);
  }
  if (excel && levelUp) {
    return 3;
  }
  if (excel) {
    return 4;
  }
  if (levelUp) {
    return 2;
  }
  return 3;
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
  return { ...current, [chipId]: stanceMarks(3) };
}

export function setChipMark(
  current: Record<string, ChipStance>,
  chipId: string,
  mark: 'excel' | 'levelUp',
): Record<string, ChipStance> {
  const row = current[chipId] ?? stanceMarks(3);
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
