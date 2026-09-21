import { THEME } from '@/lib/theme';

export const BOARD_RANK_COL = 22;
export const BOARD_AVATAR = 28;
export const BOARD_ADJUST_COL = 44;
export const BOARD_CHEVRON_COL = 44;
export const BOARD_SIDE_COL = 56;
export const BOARD_MEDAL = 20;
export const BOARD_ROW_MIN = 36;
export const BOARD_ROW_MIN_COMPACT = 34;

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

/** Compact Side mark: full Rookie / Veteran at 10px; longer labels become 3 letters. */
export function shortLaneMarkLabel(label: string): string {
  const raw = String(label ?? '').trim();
  if (!raw || raw.toLowerCase() === 'needs a side') {
    return '—';
  }
  if (raw.length <= 7) {
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
