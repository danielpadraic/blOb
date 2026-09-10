import { challengeIsEndedForAdjust } from '@/lib/hostAdjust';

export const OFFICIAL_OPS_BUY_INS = ['charge', 'house', 'none'] as const;
export type OfficialOpsBuyIn = (typeof OFFICIAL_OPS_BUY_INS)[number];

export const OFFICIAL_OPS_REMOVE_MODES = ['out_of_pot', 'leave_room'] as const;
export type OfficialOpsRemoveMode = (typeof OFFICIAL_OPS_REMOVE_MODES)[number];

const SETTLED_COPY = 'That challenge already settled.';
const ALREADY_IN_COPY = 'They’re already in.';
const ADD_FAILED_COPY = 'Couldn’t add them.';
const REMOVE_FAILED_COPY = 'Couldn’t remove them.';

export function officialOpsAddError(message: string): string {
  const text = message.trim();
  const lower = text.toLowerCase();
  if (lower.includes('already settled') || lower.includes('already ended')) {
    return SETTLED_COPY;
  }
  if (lower.includes('already in')) {
    return ALREADY_IN_COPY;
  }
  return ADD_FAILED_COPY;
}

export function officialOpsRemoveError(message: string): string {
  const text = message.trim();
  const lower = text.toLowerCase();
  if (lower.includes('already settled') || lower.includes('already ended')) {
    return SETTLED_COPY;
  }
  return REMOVE_FAILED_COPY;
}

export function canHouseActOnChallenge(challenge?: { status?: string | null } | null): boolean {
  return !challengeIsEndedForAdjust(challenge);
}

export function houseBuyInLabel(mode: OfficialOpsBuyIn): string {
  if (mode === 'charge') {
    return 'They pay the entry fee';
  }
  if (mode === 'house') {
    return 'House covers';
  }
  return 'Seat only';
}
