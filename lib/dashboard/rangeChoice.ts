import { authStorage } from '@/lib/utils/secureStore';

import type { CustomRange, DashboardRange } from '@/lib/dashboard/range';

const KEY = 'blob:dashboard-range';

export type StoredDashboardRange = {
  range: DashboardRange;
  custom: CustomRange | null;
};

const DEFAULT_CHOICE: StoredDashboardRange = { range: 'week', custom: null };

const RANGES = new Set<DashboardRange>(['today', 'week', 'last7', 'month', 'last30', 'year', 'custom']);

export async function readDashboardRange(): Promise<StoredDashboardRange> {
  try {
    const raw = await authStorage.getItem(KEY);
    if (!raw) {
      return DEFAULT_CHOICE;
    }
    const parsed = JSON.parse(raw) as { range?: string; start?: string; end?: string };
    const range = RANGES.has(parsed.range as DashboardRange) ? (parsed.range as DashboardRange) : 'week';
    const start = String(parsed.start ?? '');
    const end = String(parsed.end ?? '');
    const custom = /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) ? { start, end } : null;
    return { range, custom };
  } catch {
    return DEFAULT_CHOICE;
  }
}

export function writeDashboardRange(choice: StoredDashboardRange): void {
  try {
    void Promise.resolve(
      authStorage.setItem(
        KEY,
        JSON.stringify({
          range: choice.range,
          start: choice.custom?.start ?? '',
          end: choice.custom?.end ?? '',
        }),
      ),
    ).catch(() => undefined);
  } catch {
    // The on-screen choice still applies this visit.
  }
}
