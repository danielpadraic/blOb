import { extractPostgrestCode } from '@/lib/appErrors';
import { isCorporateChallenge } from '@/lib/challengeExperience';
import { isPrivateChallenge } from '@/lib/challengeDiscoverability';
import { copy } from '@/lib/copy';

export type ChallengeLoadKind = 'geo' | 'private' | 'unavailable' | 'server';

export type ChallengeLoadSnapshot = {
  id?: string | null;
  title?: string | null;
  cover_image_url?: string | null;
  visibility?: string | null;
  challenge_lane?: unknown;
  privacy_mode?: string | null;
  is_official?: boolean | null;
  created_by?: string | null;
  participant_count?: number | null;
};

export type ChallengeLoadError = Error & {
  name: 'ChallengeLoadError';
  kind: ChallengeLoadKind;
  code: string | null;
};

export function firstRouteParam(value: unknown): string {
  if (Array.isArray(value)) {
    return firstRouteParam(value[0]);
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

export function challengeLoadMessage(kind: ChallengeLoadKind): string {
  if (kind === 'geo') {
    return copy('geo.unavailable');
  }
  if (kind === 'private') {
    return copy('challenge.private');
  }
  if (kind === 'unavailable') {
    return copy('challenge.unavailable');
  }
  return 'Something went wrong. Try again in a moment.';
}

export function isChallengeLoadError(error: unknown): error is ChallengeLoadError {
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error as { name?: unknown }).name === 'ChallengeLoadError' &&
      typeof (error as { kind?: unknown }).kind === 'string',
  );
}

export function challengeLoadKind(error: unknown): ChallengeLoadKind | null {
  if (isChallengeLoadError(error)) {
    return error.kind;
  }
  const message = String(
    error && typeof error === 'object' && 'message' in error ? error.message : error ?? '',
  );
  if (message.includes(copy('geo.unavailable'))) {
    return 'geo';
  }
  if (message.includes(copy('challenge.private'))) {
    return 'private';
  }
  if (message.includes(copy('challenge.unavailable')) || /challenge not found/i.test(message)) {
    return 'unavailable';
  }
  return null;
}

export function createChallengeLoadError(
  kind: ChallengeLoadKind,
  source?: unknown,
  message?: string,
): ChallengeLoadError {
  const error = new Error(message ?? challengeLoadMessage(kind)) as ChallengeLoadError;
  error.name = 'ChallengeLoadError';
  error.kind = kind;
  error.code = extractPostgrestCode(source);
  return error;
}

export function isTransientNetworkError(error: unknown): boolean {
  const blob = errorBlob(error);
  return /network|failed to fetch|fetch failed|timeout|timed out|econnreset|enotfound|socket|network request failed|503|502|504|service unavailable/.test(
    blob,
  );
}

export function isHttpServerError(error: unknown): boolean {
  if (isTransientNetworkError(error)) {
    return true;
  }
  const status = errorStatus(error);
  if (status >= 500) {
    return true;
  }
  return /internal server error|\b500\b/.test(errorBlob(error));
}

export function isPermissionDeniedError(error: unknown): boolean {
  const code = extractPostgrestCode(error)?.toUpperCase() ?? '';
  if (code === '42501' || code === 'PGRST301' || code === '401' || code === '403') {
    return true;
  }
  return /permission denied|row-level security|\brls\b|not authorized/.test(errorBlob(error));
}

export function snapshotLooksPrivate(snapshot?: ChallengeLoadSnapshot | null): boolean {
  if (!snapshot) {
    return false;
  }
  if (snapshot.privacy_mode === 'private' || snapshot.privacy_mode === 'private_corporate') {
    return true;
  }
  const lane = typeof snapshot.challenge_lane === 'string' ? snapshot.challenge_lane : null;
  return (
    isPrivateChallenge({
      visibility: snapshot.visibility,
      challenge_lane: snapshot.challenge_lane,
    }) ||
    isCorporateChallenge({
      privacy_mode: snapshot.privacy_mode,
      challenge_lane: lane,
    })
  );
}

export function classifyChallengeLoadFailure(input: {
  accessReason?: string | null;
  snapshot?: ChallengeLoadSnapshot | null;
  error?: unknown;
}): ChallengeLoadKind {
  const reason = String(input.accessReason ?? '').trim().toLowerCase();
  if (reason === 'geo' || challengeLoadKind(input.error) === 'geo') {
    return 'geo';
  }
  if (reason === 'private' || snapshotLooksPrivate(input.snapshot)) {
    return 'private';
  }
  if (isHttpServerError(input.error)) {
    return 'server';
  }
  return 'unavailable';
}

function errorBlob(error: unknown): string {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
  const parts = [
    record?.message,
    record?.code,
    record?.details,
    record?.hint,
    record?.status,
    error instanceof Error ? error.message : error,
  ];
  return parts
    .filter((part) => part != null && part !== '')
    .map((part) => String(part))
    .join(' ')
    .toLowerCase();
}

function errorStatus(error: unknown): number {
  if (!error || typeof error !== 'object') {
    return 0;
  }
  const record = error as { status?: unknown; statusCode?: unknown };
  const status = Number(record.status ?? record.statusCode ?? 0);
  return Number.isFinite(status) ? status : 0;
}
