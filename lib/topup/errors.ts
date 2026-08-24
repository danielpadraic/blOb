import { isLikelyOffline, isOfflineError } from '@/lib/checkin/errors';

import { TOPUP_COPY } from './copy';

export type TopUpFailKind =
  | 'declined'
  | 'insufficient_card'
  | 'expired'
  | 'network'
  | 'offline'
  | 'already'
  | 'amount_limit'
  | 'daily_limit'
  | 'canceled'
  | 'unavailable'
  | 'pending'
  | 'generic';

export function classifyTopUpError(error: unknown): TopUpFailKind {
  if (isLikelyOffline() || isOfflineError(error)) {
    return 'offline';
  }
  const raw = extractRaw(error).toLowerCase();
  if (raw.includes('already') || raw.includes('already_applied') || raw.includes('already-processed')) {
    return 'already';
  }
  if (raw.includes('daily_limit') || raw.includes('daily add')) {
    return 'daily_limit';
  }
  if (raw.includes('amount_limit') || raw.includes('invalid_amount') || raw.includes('between $1')) {
    return 'amount_limit';
  }
  if (raw.includes('card_declined') || raw.includes('declined')) {
    return 'declined';
  }
  if (raw.includes('expired_card') || raw.includes('expired')) {
    return 'expired';
  }
  if (raw.includes('insufficient_funds') || raw.includes('insufficient card')) {
    return 'insufficient_card';
  }
  if (raw.includes('canceled') || raw.includes('cancelled') || raw.includes('cancel')) {
    return 'canceled';
  }
  if (raw.includes('unavailable') || raw.includes('not configured') || raw.includes('stripe')) {
    return 'unavailable';
  }
  if (raw.includes('pending') || raw.includes('processing')) {
    return 'pending';
  }
  if (raw.includes('network') || raw.includes('timeout') || raw.includes('failed to fetch')) {
    return 'network';
  }
  return 'generic';
}

export function topUpErrorCopy(kind: TopUpFailKind | string): string {
  switch (String(kind)) {
    case 'declined':
    case 'card_declined':
      return TOPUP_COPY.declined;
    case 'insufficient_card':
    case 'insufficient_funds':
      return TOPUP_COPY.insufficientCard;
    case 'expired':
    case 'expired_card':
      return TOPUP_COPY.expired;
    case 'network':
      return TOPUP_COPY.network;
    case 'offline':
      return TOPUP_COPY.offline;
    case 'already':
    case 'already_applied':
      return TOPUP_COPY.already;
    case 'amount_limit':
    case 'limit':
    case 'invalid':
      return TOPUP_COPY.amountLimit;
    case 'daily_limit':
      return TOPUP_COPY.dailyLimit;
    case 'canceled':
      return TOPUP_COPY.canceled;
    case 'unavailable':
      return TOPUP_COPY.unavailable;
    case 'pending':
      return TOPUP_COPY.processing;
    default:
      return TOPUP_COPY.generic;
  }
}

function extractRaw(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    const row = error as { message?: string; code?: string; error?: string };
    return [row.message, row.code, row.error].filter(Boolean).join(' ');
  }
  return '';
}
