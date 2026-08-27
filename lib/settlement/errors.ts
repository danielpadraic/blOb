export type SettlementFailKind =
  | 'already_settled'
  | 'race'
  | 'zero_remaining'
  | 'insufficient_float'
  | 'geo_restricted'
  | 'offline'
  | 'not_ended'
  | 'not_even_split'
  | 'cooldown'
  | 'generic';

export const SETTLEMENT_ERROR_COPY: Record<SettlementFailKind, string> = {
  already_settled: 'This challenge is already settled.',
  race: 'Settlement is already running. Hang tight.',
  zero_remaining: 'Nobody remaining. The prize is forfeited. No refunds.',
  insufficient_float: 'The prize could not move right now. Try again in a moment.',
  geo_restricted: 'This prize is not available in your region.',
  offline: 'You’re offline. Settlement will finish when you’re back.',
  not_ended: 'This challenge is still going.',
  not_even_split: 'This prize is ranked, not an even split. Host Settle pays first place or top places.',
  cooldown: 'Payout unlocks 1 hour after the challenge ends.',
  generic: 'Couldn’t settle this challenge. Try again.',
};

const SETTLEMENT_RPC_COPY: Record<string, string> = {
  NOT_EVEN_SPLIT: SETTLEMENT_ERROR_COPY.not_even_split,
  ALREADY_SETTLED: SETTLEMENT_ERROR_COPY.already_settled,
  ALREADY_DISTRIBUTED: SETTLEMENT_ERROR_COPY.already_settled,
  CHALLENGE_NOT_ENDED: SETTLEMENT_ERROR_COPY.not_ended,
  COOLDOWN_ACTIVE: SETTLEMENT_ERROR_COPY.cooldown,
  TOO_EARLY_DISTRIBUTE: SETTLEMENT_ERROR_COPY.cooldown,
  LMS_NOT_FINISHED: 'Last person standing is not down to one person yet.',
  NO_WINNER: 'There is no winner to pay.',
  NO_COMPLETERS: 'Nobody completed this challenge.',
  OPEN_DISPUTES: 'Payouts wait until open disputes are resolved.',
  NOT_STARTED: 'This challenge hasn’t started yet.',
  NO_END_TIME: 'This challenge doesn’t have an end date.',
  NOT_CREATOR: 'Only the host can close or pay out.',
  NOT_HOST: 'Only the host can close or pay out.',
};

function extractRaw(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; details?: unknown; code?: unknown };
    return [record.code, record.message, record.details].filter(Boolean).join(' ');
  }
  return '';
}

export function isLikelyOffline(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return navigator.onLine === false;
}

export function classifySettlementError(error: unknown): SettlementFailKind {
  if (isLikelyOffline()) {
    return 'offline';
  }
  const raw = extractRaw(error).toLowerCase();
  if (raw.includes('not_even_split') || raw.includes('not an even split')) {
    return 'not_even_split';
  }
  if (raw.includes('cooldown_active') || raw.includes('too_early_distribute') || raw.includes('unlocks 1 hour')) {
    return 'cooldown';
  }
  if (raw.includes('already_settled') || raw.includes('already settled') || raw.includes('already paid') || raw.includes('already_distributed')) {
    return 'already_settled';
  }
  if (raw.includes('unique') || raw.includes('23505') || raw.includes('concurrent') || raw.includes('could not serialize')) {
    return 'race';
  }
  if (raw.includes('zero remaining') || raw.includes('nobody remaining') || raw.includes('forfeit')) {
    return 'zero_remaining';
  }
  if (raw.includes('insufficient') || raw.includes('float') || raw.includes('insufficient_float')) {
    return 'insufficient_float';
  }
  if (raw.includes('geo') || raw.includes('region') || raw.includes('not available in')) {
    return 'geo_restricted';
  }
  if (
    raw.includes('network') ||
    raw.includes('failed to fetch') ||
    raw.includes('offline') ||
    raw.includes('network request failed')
  ) {
    return 'offline';
  }
  if (raw.includes('challenge_not_ended') || raw.includes('not_ended') || raw.includes('still going')) {
    return 'not_ended';
  }
  return 'generic';
}

function mapSettlementRpcCopy(raw: string): string | null {
  const upper = raw.toUpperCase();
  for (const [code, copy] of Object.entries(SETTLEMENT_RPC_COPY)) {
    if (upper.includes(code)) {
      return copy;
    }
  }
  return null;
}

export function settlementErrorCopy(error: unknown): string {
  const raw = extractRaw(error).trim();
  const mapped = mapSettlementRpcCopy(raw);
  if (mapped) {
    return mapped;
  }
  const kind = classifySettlementError(error);
  if (kind !== 'generic') {
    return SETTLEMENT_ERROR_COPY[kind];
  }
  if (raw && /[a-z]/.test(raw) && raw.includes(' ')) {
    return raw.replace(/^error:\s*/i, '').trim();
  }
  if (raw) {
    return raw;
  }
  return SETTLEMENT_ERROR_COPY.generic;
}
