import {
  INTEREST_ROOM_SLUGS,
  type InterestRoomSlug,
  type InterestRoomState,
} from '@/lib/interestsCatalog';

export type ChipStance = {
  excel: boolean;
  levelUp: boolean;
};

export type RoomSaveAction = 'skip' | 'none' | 'save';

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

export function toggleChipStance(
  current: Record<string, ChipStance>,
  chipId: string,
): Record<string, ChipStance> {
  if (current[chipId]) {
    const next = { ...current };
    delete next[chipId];
    return next;
  }
  return { ...current, [chipId]: { excel: true, levelUp: false } };
}

export function setChipMark(
  current: Record<string, ChipStance>,
  chipId: string,
  mark: 'excel' | 'levelUp',
): Record<string, ChipStance> {
  const row = current[chipId] ?? { excel: true, levelUp: false };
  const next = { ...row, [mark]: !row[mark] };
  if (!next.excel && !next.levelUp) {
    next[mark] = true;
  }
  return { ...current, [chipId]: next };
}

export function continueBlocked(input: {
  stances: Record<string, ChipStance>;
  workOn: boolean;
  occupation: string;
  employer: string;
  otherOn: boolean;
  otherText: string;
}): string | null {
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

export function stateForSave(action: RoomSaveAction, chipCount: number): InterestRoomState {
  if (action === 'skip') {
    return 'incomplete';
  }
  if (action === 'none' || chipCount === 0) {
    return 'complete_empty';
  }
  return 'complete_filled';
}
