export type CheckinFailKind =
  | 'offline'
  | 'permission'
  | 'upload'
  | 'already'
  | 'not_live'
  | 'not_joined'
  | 'missing'
  | 'generic';

export function isLikelyOffline(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return navigator.onLine === false;
}

export function isOfflineError(error: unknown): boolean {
  if (isLikelyOffline()) {
    return true;
  }
  const raw = extractRaw(error).toLowerCase();
  return (
    raw.includes('network') ||
    raw.includes('failed to fetch') ||
    raw.includes('offline') ||
    raw.includes('internet') ||
    raw.includes('network request failed') ||
    raw.includes('err_internet_disconnected')
  );
}

export function isPermissionError(error: unknown): boolean {
  const raw = extractRaw(error).toLowerCase();
  return (
    raw.includes('permission') ||
    raw.includes('camera is off') ||
    raw.includes('not authorized') ||
    raw.includes('denied')
  );
}

export function isUploadError(error: unknown): boolean {
  const raw = extractRaw(error).toLowerCase();
  return (
    raw.includes('upload') ||
    raw.includes('couldn’t save that proof') ||
    raw.includes('couldnt save that proof') ||
    raw.includes('storage') ||
    raw.includes('bucket')
  );
}

export function classifyCheckinError(error: unknown): CheckinFailKind {
  const raw = extractRaw(error).toLowerCase();
  if (isOfflineError(error)) {
    return 'offline';
  }
  if (isPermissionError(error)) {
    return 'permission';
  }
  if (
    raw.includes('already_logged_today') ||
    raw.includes('already checked in') ||
    raw.includes('already submitted')
  ) {
    return 'already';
  }
  if (raw.includes('not_started') || raw.includes('hasn’t started') || raw.includes('hasnt started')) {
    return 'not_live';
  }
  if (raw.includes('logging is closed') || raw.includes('check-in is closed')) {
    return 'not_live';
  }
  if (raw.includes('not_participant') || raw.includes('join this challenge')) {
    return 'not_joined';
  }
  if (raw.includes('missing_proofs') || raw.includes('required proof')) {
    return 'missing';
  }
  if (isUploadError(error)) {
    return 'upload';
  }
  return 'generic';
}

export function mapCheckinRpcError(
  error: { message?: string; code?: string; details?: string },
  kind: 'save' | 'submit',
): string {
  const blob = [error.code, error.message, error.details].filter(Boolean).join(' ');
  const upper = blob.toUpperCase();
  if (upper.includes('ALREADY_LOGGED_TODAY') || upper.includes('ALREADY CHECKED IN')) {
    return 'Already checked in today. Come back tomorrow.';
  }
  if (upper.includes('MISSING_PROOFS')) {
    return 'Add every required proof to submit.';
  }
  if (upper.includes('NOT_PARTICIPANT') || upper.includes('JOIN THIS CHALLENGE')) {
    return 'Join this challenge before you check in.';
  }
  if (upper.includes('NOT_STARTED')) {
    return 'This challenge hasn’t started yet.';
  }
  if (upper.includes('BEGIN CHECK-IN FIRST')) {
    return 'Begin check-in first.';
  }
  if (kind === 'submit') {
    return 'Couldn’t submit this check-in. Try again.';
  }
  if (
    upper.includes('42804') ||
    upper.includes('22P02') ||
    upper.includes('PGRST') ||
    (upper.includes('TASK_IDS') && upper.includes('JSONB'))
  ) {
    return 'Couldn’t save that proof. Try again.';
  }
  return error.message?.trim() || 'Couldn’t save that proof. Try again.';
}

function extractRaw(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; details?: unknown };
    return [record.message, record.details].filter(Boolean).join(' ');
  }
  return '';
}
