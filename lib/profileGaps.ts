import { hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import type { Profile } from '@/lib/types';

export type ProfileGap = {
  id: 'physical' | 'phone' | 'address' | 'dob';
  label: string;
};

/** Fields a gated action (Official fitness / paid) may still need. */
export function missingProfileGaps(profile?: Profile | null): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  if (!hasCompletedBodyMetrics(profile)) {
    gaps.push({ id: 'physical', label: 'physical details' });
  }
  if (profile && 'phone' in profile && !String((profile as { phone?: string | null }).phone ?? '').trim()) {
    gaps.push({ id: 'phone', label: 'phone' });
  }
  if (
    profile &&
    'address_line' in profile &&
    !String((profile as { address_line?: string | null }).address_line ?? '').trim()
  ) {
    gaps.push({ id: 'address', label: 'address' });
  }
  if (
    profile &&
    'date_of_birth' in profile &&
    !String((profile as { date_of_birth?: string | null }).date_of_birth ?? '').trim()
  ) {
    gaps.push({ id: 'dob', label: 'date of birth' });
  }
  return gaps;
}

export function missingProfileSummary(profile?: Profile | null): string | null {
  const gaps = missingProfileGaps(profile);
  if (gaps.length === 0) {
    return null;
  }
  return `Missing: ${gaps.map((gap) => gap.label).join(', ')}.`;
}
