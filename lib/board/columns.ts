import { THEME } from '@/lib/theme';

/** Phone ~360–390 lock. Fixed first, name last. */
export const BOARD_RANK_COL = 28;
export const BOARD_AVATAR = 28;
export const BOARD_ADJUST_COL = 44;
export const BOARD_CHEVRON_COL = 22;
export const BOARD_SIDE_COL = 62;
export const BOARD_PTS_COL = 54;
export const BOARD_MEDAL = 22;
export const BOARD_GAP = 6;
export const BOARD_NAME_GAP = 8;
export const BOARD_ROW_MIN = 48;
export const BOARD_ROW_MIN_COMPACT = 44;

export type BoardStatKind = 'dials' | 'pres' | 'ap';

/** Map nest icons by activity label. Unknown names get a letter circle, not clip-art. */
export function boardStatKind(label: string, money?: boolean): BoardStatKind | null {
  const hay = String(label ?? '')
    .trim()
    .toLowerCase();
  if (/\b(dials?|calls?|phone)\b/.test(hay)) {
    return 'dials';
  }
  if (/\b(pres|presentations?)\b/.test(hay)) {
    return 'pres';
  }
  if (money || /\b(ap|premium|production)\b/.test(hay) || hay.includes('$')) {
    return 'ap';
  }
  return null;
}

/** Fixed columns on a phone row (name is the only flex child). */
export function boardPhoneFixedReserve(opts: { hasSide: boolean; hasChevron: boolean; hasAdjust?: boolean }): number {
  let n = BOARD_RANK_COL + BOARD_GAP + BOARD_AVATAR + BOARD_NAME_GAP + BOARD_GAP + BOARD_PTS_COL;
  if (opts.hasSide) {
    n += BOARD_GAP + BOARD_SIDE_COL;
  }
  if (opts.hasChevron) {
    n += BOARD_CHEVRON_COL;
  }
  if (opts.hasAdjust) {
    n += BOARD_ADJUST_COL;
  }
  return n;
}

export type BoardMedalTone = 'gold' | 'silver' | 'bronze';

export function formatBoardPoints(value: number): string {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return n.toLocaleString('en-US');
}

export function formatBoardNestedQty(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) {
    return '0';
  }
  if (Number.isInteger(n)) {
    return n.toLocaleString('en-US');
  }
  return (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Compact Side mark: full Rookie / Veteran at 10px; unlabeled stays “Needs a side”. */
export function shortLaneMarkLabel(label: string): string {
  const raw = String(label ?? '').trim();
  if (!raw || raw.toLowerCase() === 'needs a side') {
    return 'Needs a side';
  }
  if (raw.length <= 8) {
    return raw;
  }
  return raw.slice(0, 3);
}

export function shortBoardHeader(label: string): string {
  const raw = String(label ?? '').trim();
  const key = raw.toLowerCase();
  if (key === 'presentations' || key === 'presentation') {
    return 'Pres';
  }
  if (key === 'points' || key === 'pts') {
    return 'Pts';
  }
  if (key === 'miles' || key === 'mile') {
    return 'mi';
  }
  if (key === 'days' || key === 'day') {
    return 'Days';
  }
  if (key === 'progress') {
    return 'Prog';
  }
  return raw;
}

export function boardColumnWidth(
  samples: string[],
  opts?: { compact?: boolean; min?: number; max?: number },
): number {
  const ch = opts?.compact ? 6.3 : 7;
  const longest = samples.reduce((n, sample) => Math.max(n, String(sample ?? '').length), 1);
  return Math.min(opts?.max ?? 80, Math.max(opts?.min ?? 28, Math.round(longest * ch + 4)));
}

/** Medals for displayed ranks 1–3. Ties already share a rank from rankBoardRows. */
export function boardMedalTone(rank: number | null | undefined): BoardMedalTone | null {
  if (rank === 1) {
    return 'gold';
  }
  if (rank === 2) {
    return 'silver';
  }
  if (rank === 3) {
    return 'bronze';
  }
  return null;
}

export function boardMedalColor(tone: BoardMedalTone | null | undefined): string | null {
  if (tone === 'gold') {
    return THEME.medalGold;
  }
  if (tone === 'silver') {
    return THEME.medalSilver;
  }
  if (tone === 'bronze') {
    return THEME.medalBronze;
  }
  return null;
}

/** ~8% wash behind ranks 1–3. Gold / slate / bronze from the medal hexes. */
export function boardMedalWash(tone: BoardMedalTone | null | undefined): string | undefined {
  if (tone === 'gold') {
    return 'rgba(201, 162, 39, 0.08)';
  }
  if (tone === 'silver') {
    return 'rgba(168, 176, 184, 0.08)';
  }
  if (tone === 'bronze') {
    return 'rgba(184, 115, 51, 0.08)';
  }
  return undefined;
}

/** First paint: every standing row is collapsed, including 1–3. */
export function initialExpandedBoardIds(
  _rows?: { userId: string; rank: number | null; bucket?: string }[],
  _kind?: 'points' | 'other',
): string[] {
  return [];
}
