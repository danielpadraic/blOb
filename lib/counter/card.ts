import { format } from 'date-fns';

import { formatCounterNumber, formatCounterSummary } from '@/lib/counter/session';
import type { CounterDraft } from '@/lib/counter/types';

export const COUNTER_CARD_WIDTH = 1080;
export const COUNTER_CARD_HEIGHT = 1350;

export type CounterCardModel = {
  title: string;
  dateLine: string;
  rows: { name: string; value: string }[];
  summary: string;
};

export function buildCounterCard(draft: CounterDraft): CounterCardModel {
  const when = draft.savedAt ?? draft.updatedAt ?? draft.createdAt;
  return {
    title: draft.title,
    dateLine: format(new Date(when), 'MMM d, yyyy · h:mm a'),
    rows: draft.metrics.map((row) => ({
      name: row.name,
      value: formatCounterNumber(row.kind, row.value),
    })),
    summary: formatCounterSummary(draft.metrics),
  };
}

export function counterCardFallbackText(card: CounterCardModel): string {
  return [card.title, card.dateLine, card.summary].filter(Boolean).join('\n');
}
