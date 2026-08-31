/** Weekly vs monthly proof family. Same object may score one of each — never two weeklies. */

export type ProofUniquenessFamily = 'weekly' | 'monthly';

const MONTHLY_FREQ = new Set(['monthly', 'month']);
const MONTHLY_SERIES = /month/;

export function proofUniquenessFamily(challenge: {
  frequency?: string | null;
  series_id?: string | null;
  duration_days?: number | null;
  length_value?: number | null;
  length_unit?: string | null;
  days_required?: number | null;
} | null | undefined): ProofUniquenessFamily {
  if (!challenge) {
    return 'weekly';
  }
  const freq = String(challenge.frequency ?? '').trim().toLowerCase();
  if (MONTHLY_FREQ.has(freq)) {
    return 'monthly';
  }
  if (MONTHLY_SERIES.test(String(challenge.series_id ?? '').toLowerCase())) {
    return 'monthly';
  }
  const unit = String(challenge.length_unit ?? '').trim().toLowerCase();
  if (unit.startsWith('month')) {
    return 'monthly';
  }
  const days = Math.max(
    Math.floor(Number(challenge.duration_days) || 0),
    unit.startsWith('week') ? Math.floor(Number(challenge.length_value) || 0) * 7 : 0,
    Math.floor(Number(challenge.days_required) || 0),
  );
  if (days >= 28 && freq !== 'daily' && freq !== 'weekly' && freq !== 'week') {
    return 'monthly';
  }
  return 'weekly';
}

/** Storage object identity. Query tokens do not count as a new file. */
export function proofObjectKey(url: string | null | undefined): string {
  const raw = String(url ?? '').trim().split('#')[0]?.split('?')[0] ?? '';
  if (!raw) {
    return '';
  }
  const lowered = raw.toLowerCase();
  const publicIdx = lowered.indexOf('/storage/v1/object/public/');
  if (publicIdx >= 0) {
    return decodeURIComponent(raw.slice(publicIdx + '/storage/v1/object/public/'.length));
  }
  const signIdx = lowered.indexOf('/storage/v1/object/sign/');
  if (signIdx >= 0) {
    return decodeURIComponent(raw.slice(signIdx + '/storage/v1/object/sign/'.length));
  }
  try {
    const parsed = new URL(raw);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    return lowered.replace(/^https?:\/\//, '');
  }
}

export function healthProofFingerprint(healthWorkoutId: string | null | undefined): string {
  const id = String(healthWorkoutId ?? '').trim();
  return id ? `health:${id}` : '';
}

export function proofReuseBlocked(input: {
  family: ProofUniquenessFamily;
  otherFamily: ProofUniquenessFamily;
  sameProof: boolean;
}): boolean {
  return input.sameProof && input.family === input.otherFamily;
}

export function proofAlreadyCountsCopy(otherTitle: string | null | undefined): string {
  const title = String(otherTitle ?? '').trim() || 'another challenge';
  return `That proof already counts on ${title}.`;
}

export function parseProofAlreadyCountsError(error: unknown): string | null {
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : error && typeof error === 'object'
          ? String((error as { message?: unknown }).message ?? '')
          : '';
  const match = raw.match(/PROOF_ALREADY_COUNTS[:\s]+(.+)/i);
  if (!match) {
    if (/already counts on /i.test(raw)) {
      return raw.trim();
    }
    return null;
  }
  const title = match[1].replace(/\s+$/g, '').replace(/\.+$/g, '').trim();
  return proofAlreadyCountsCopy(title);
}

/** Hide-from-Home is a post flag only. Board days / points stay as passed in. */
export function scoreAfterHideFromHome(input: { days: number; points: number }): {
  days: number;
  points: number;
} {
  return {
    days: Math.max(0, Math.floor(Number(input.days) || 0)),
    points: Math.max(0, Number(input.points) || 0),
  };
}
