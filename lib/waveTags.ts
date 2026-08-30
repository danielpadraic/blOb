import { isEndedPrizeStatus } from '@/lib/challengePot';

const WAVE_TAG_ACTIVE = new Set([
  'open',
  'live',
  'upcoming',
  'filling',
  'arming',
  'in_progress',
  'starting',
]);

/** Wave / Round challenge chips: Active only. Ended TEST leftovers stay off the row. */
export function isActiveWaveTagStatus(status?: string | null): boolean {
  const value = String(status ?? '').trim().toLowerCase();
  if (!value || isEndedPrizeStatus(value) || value === 'ended' || value === 'draft') {
    return false;
  }
  return WAVE_TAG_ACTIVE.has(value);
}
