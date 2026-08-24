import { normalizePeriodKey } from '@/lib/checkinPeriod';

export function asLoggableList<T extends { id?: string | null }>(
  value: T | T[] | null | undefined,
): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value.filter((row) => Boolean(row?.id)) : value.id ? [value] : [];
}

export function loggableStatusLine(input: {
  ends_at?: string | null;
  days_required?: number | null;
  daysCompleted?: number | null;
  todayKey?: string | null;
}): string | undefined {
  const target = Math.max(0, Number(input.days_required) || 0);
  const completed = Math.max(0, Number(input.daysCompleted) || 0);
  const endKey = input.ends_at ? normalizePeriodKey(input.ends_at) : '';
  if (endKey && input.todayKey && endKey === input.todayKey) {
    return 'Due today';
  }
  if (target > 0) {
    const day = Math.min(Math.max(completed + 1, 1), target);
    return `Day ${day} of ${target}`;
  }
  return undefined;
}
