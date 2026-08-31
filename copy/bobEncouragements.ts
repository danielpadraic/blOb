import { asCopyTone, interpolateCopy } from '@/lib/copy';

import { BOB_CATALOG } from '@/copy/bobCatalog.generated';

export const BOB_ENCOURAGEMENT_TONES = ['gentle', 'honest'] as const;
export type BobEncouragementTone = (typeof BOB_ENCOURAGEMENT_TONES)[number];

export const BOB_ENCOURAGEMENT_CATEGORIES = [
  'checkin_streak_5plus',
  'checkin_streak_2',
  'login_after_gap',
  'streak_broke',
  'gone_3',
  'gone_7',
  'gone_14',
  'miss_still_in',
  'miss_removed',
  'final_week',
  'podium_d3',
] as const;

export type BobEncouragementCategory = (typeof BOB_ENCOURAGEMENT_CATEGORIES)[number];

export const BOB_LINE_MAX = 140;

type ToneLines = Record<BobEncouragementTone, readonly string[]>;

/** 2026-08-31 catalog. Gentle | Honest only. Neutral maps to Gentle. */
export const BOB_ENCOURAGEMENTS = BOB_CATALOG as Record<BobEncouragementCategory, ToneLines>;

export type PickBobLineInput = {
  category: BobEncouragementCategory;
  tone?: string | null;
  n?: number | string | null;
  challenge?: string | null;
  usedIndexes?: Iterable<number>;
};

export type PickedBobLine = {
  index: number;
  text: string;
};

function asCategory(value: string): BobEncouragementCategory | null {
  return (BOB_ENCOURAGEMENT_CATEGORIES as readonly string[]).includes(value)
    ? (value as BobEncouragementCategory)
    : null;
}

/** Name the challenge. Never leave “the field” as a nameless stand-in. */
export function ensureChallengeToken(template: string): string {
  let text = template;
  text = text.replace(/\bthe next field\b/gi, '{challenge}');
  text = text.replace(/\bthis field\b/gi, '{challenge}');
  text = text.replace(/\ba field\b/gi, '{challenge}');
  text = text.replace(/\bthe field\b/gi, '{challenge}');
  if (!/\{challenge\}/i.test(text)) {
    text = `${text.replace(/[.!?]\s*$/, '')} — {challenge}.`;
  }
  return text;
}

export function clipChallengeTitle(title: string, max: number): string {
  const trimmed = title.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= max) {
    return trimmed;
  }
  if (max <= 1) {
    return '…';
  }
  return `${trimmed.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function interpolateBobLine(
  template: string,
  vars?: { n?: number | string | null; challenge?: string | null },
): string {
  const named = ensureChallengeToken(template);
  const afterN = interpolateCopy(named, { n: vars?.n ?? '' });
  const rawTitle = String(vars?.challenge ?? '').trim();
  if (!rawTitle) {
    return '';
  }
  const leftover = afterN.replace(/\{challenge\}/g, '');
  const slots = Math.max((afterN.match(/\{challenge\}/g) ?? []).length, 1);
  const budget = BOB_LINE_MAX - leftover.length;
  const maxEach = Math.max(1, Math.floor(budget / slots));
  const title = clipChallengeTitle(rawTitle, Math.min(48, maxEach));
  const text = afterN.replace(/\{challenge\}/g, title).replace(/\s+/g, ' ').trim();
  if (!title || text.length > BOB_LINE_MAX) {
    return '';
  }
  return text;
}

export function pickBobLine(input: PickBobLineInput): PickedBobLine | null {
  const category = asCategory(String(input.category ?? ''));
  if (!category) {
    return null;
  }
  const tone = asCopyTone(input.tone);
  const lines = BOB_ENCOURAGEMENTS[category][tone];
  const used = new Set<number>();
  for (const index of input.usedIndexes ?? []) {
    used.add(index);
  }
  const eligible: PickedBobLine[] = [];
  lines.forEach((template, index) => {
    if (used.has(index)) {
      return;
    }
    const text = interpolateBobLine(template, {
      n: input.n,
      challenge: input.challenge,
    });
    if (!text || text.length > BOB_LINE_MAX) {
      return;
    }
    const lower = text.toLowerCase();
    if (/\blog\b/.test(lower) && !lower.includes('check-in') && !lower.includes('checked in')) {
      return;
    }
    eligible.push({ index, text });
  });
  if (eligible.length === 0) {
    return null;
  }
  return eligible[Math.floor(Math.random() * eligible.length)] ?? null;
}
