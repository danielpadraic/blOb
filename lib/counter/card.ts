import { formatCounterDate, formatCounterNumber, formatCounterSummary } from '@/lib/counter/session';
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
  return {
    title: draft.title,
    dateLine: formatCounterDate(draft.counterDate),
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
