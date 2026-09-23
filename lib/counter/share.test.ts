import { describe, expect, it } from 'vitest';

import { buildCounterCard, counterCardFallbackText } from '@/lib/counter/card';
import { COUNTER_START_HREF, COUNTER_HISTORY_HREF, counterHref } from '@/lib/routes';
import { isSafeNotificationHref } from '@/lib/notificationHref';
import type { CounterDraft } from '@/lib/counter/types';

const draft: CounterDraft = {
  id: 'c1',
  title: 'Sales day',
  status: 'saved',
  parentId: 'live-1',
  cardUrl: null,
  metrics: [
    { id: '1', key: '1', name: 'Dials', kind: 'count', value: 10, sort: 0 },
    { id: '2', key: '2', name: 'Presentations', kind: 'count', value: 0, sort: 1 },
    { id: '3', key: '3', name: 'AP', kind: 'money', value: 16000, sort: 2 },
  ],
  createdAt: '2026-09-23T12:00:00.000Z',
  updatedAt: '2026-09-23T12:00:00.000Z',
  savedAt: '2026-09-23T12:00:00.000Z',
};

describe('counter card + routes', () => {
  it('prints money with a dollar sign on the share card', () => {
    const card = buildCounterCard(draft);
    expect(card.title).toBe('Sales day');
    expect(card.rows.map((row) => row.value)).toEqual(['10', '0', '$16,000.00']);
    expect(counterCardFallbackText(card)).toContain('AP $16,000.00');
  });

  it('owns /counter deep links', () => {
    expect(COUNTER_START_HREF).toBe('/counter');
    expect(COUNTER_HISTORY_HREF).toBe('/counter/history');
    expect(counterHref('abc')).toBe('/counter/abc');
    expect(isSafeNotificationHref('/counter')).toBe(true);
    expect(isSafeNotificationHref('/counter/abc')).toBe(true);
  });
});
