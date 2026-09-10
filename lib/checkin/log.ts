export type CheckinLogPhase = 'upload' | 'save' | 'submit';

/** One line for Safari Send. No PII, no file bytes. */
export function logCheckinPhase(
  phase: CheckinLogPhase,
  status: string,
  message?: string | null,
): void {
  const text = String(message ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  console.log('[blob:checkin]', { phase, status, message: text || undefined });
}
