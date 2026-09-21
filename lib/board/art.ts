import type { BoardMedalTone, BoardStatKind } from '@/lib/board/columns';

/** Board-only art. Copied into assets/images/board — do not hotlink artifacts. */
export const BOARD_MEDAL_ART = {
  gold: require('@/assets/images/board/medal-gold.png'),
  silver: require('@/assets/images/board/medal-silver.png'),
  bronze: require('@/assets/images/board/medal-bronze.png'),
} as const;

export const BOARD_STAT_ART = {
  dials: require('@/assets/images/board/stat-dials.png'),
  pres: require('@/assets/images/board/stat-pres.png'),
  ap: require('@/assets/images/board/stat-ap.png'),
} as const;

export function boardMedalSource(tone: BoardMedalTone | null | undefined) {
  return tone ? BOARD_MEDAL_ART[tone] : null;
}

export function boardStatSource(kind: BoardStatKind | null | undefined) {
  return kind ? BOARD_STAT_ART[kind] : null;
}
