export type SettlementFailKind =
  | 'already_settled'
  | 'race'
  | 'zero_remaining'
  | 'insufficient_float'
  | 'geo_restricted'
  | 'offline'
  | 'not_ended'
  | 'generic';

export const SETTLEMENT_ERROR_COPY: Record<SettlementFailKind, string> = {
  already_settled: 'This challenge is already settled.',
  race: 'Settlement is already running. Hang tight.',
  zero_remaining: 'Nobody remaining. The prize is forfeited. No refunds.',
  insufficient_float: 'The prize could not move right now. Try again in a moment.',
  geo_restricted: 'This prize is not available in your region.',
  offline: 'You’re offline. Settlement will finish when you’re back.',
  not_ended: 'This challenge is still going.',
  generic: 'Couldn’t settle this challenge. Try again.',
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
  if (raw.includes('already_settled') || raw.includes('already settled') || raw.includes('already paid')) {
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

export function settlementErrorCopy(error: unknown): string {
  return SETTLEMENT_ERROR_COPY[classifySettlementError(error)];
}
