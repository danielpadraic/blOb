import { isCompletedStatus } from '@/lib/lift/complete';
import type { LiftSessionSummary } from '@/lib/lift/types';

/**
 * Which of the owner's sessions appear in the check-in attach picker, and in what order.
 *
 * Newest first. Drafts, completed, and favorites all belong here — attaching is choosing a session
 * id, not finishing one. Nothing is pre-selected: the first row is often off-screen behind the
 * keyboard, and last-open is the wrong id.
 */

export function filterAttachableSessions(
  rows: readonly LiftSessionSummary[],
  query = '',
): LiftSessionSummary[] {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((row) => {
        const hay = [row.title, ...(row.preview ?? [])].join(' ').toLowerCase();
        return hay.includes(needle);
      })
    : [...rows];
  return filtered.sort((a, b) => {
    const byTime = Date.parse(b.performedAt) - Date.parse(a.performedAt);
    if (byTime !== 0) {
      return byTime;
    }
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

export function attachStatusChip(session: Pick<LiftSessionSummary, 'status' | 'completedAt'>): 'Draft' | 'Completed' {
  return isCompletedStatus(session.status, session.completedAt) ? 'Completed' : 'Draft';
}
