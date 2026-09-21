import { THEME } from '@/lib/theme';

export const BOARD_RANK_COL = 26;
export const BOARD_AVATAR = 28;
export const BOARD_ADJUST_COL = 44;
export const BOARD_CHEVRON_COL = 44;
export const BOARD_SIDE_COL = 80;
export const BOARD_MEDAL = 22;
export const BOARD_ROW_MIN = 48;
export const BOARD_ROW_MIN_COMPACT = 44;

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

/** First paint: ranks 1–3 open on comparable / points Boards. */
export function initialExpandedBoardIds(
  rows: { userId: string; rank: number | null; bucket?: string }[],
  kind: 'points' | 'other',
): string[] {
  if (kind !== 'points') {
    return [];
  }
  return rows
    .filter((row) => row.bucket !== 'dropped' && row.rank != null && row.rank <= 3)
    .map((row) => row.userId);
}
