import { formatBoardPoints } from './columns';
import { quantityBoardHeaderLine } from './copy';

export type BoardHeaderFormat = 'quantity' | 'consistency' | 'points' | 'lanes';

export type BoardLaneSideTotal = {
  id: string;
  label: string;
  points: number;
};

const PHONE_BOARD_WIDTH = 390;
const CARD_PAD = 16;
const DETAILS_COL = 100;
const HEADER_GAP = 8;
const CHAR_PX = 7.4;

/** Sum Pts for racing rows on each lane. Dropped and Needs a side are excluded. */
export function boardLaneSideTotals(input: {
  rows: { userId: string; points: number; bucket: string }[];
  laneOf: (userId: string) => string | null | undefined;
  lanes: { id: string; label: string }[];
}): BoardLaneSideTotal[] {
  const sums = new Map(input.lanes.map((lane) => [lane.id, 0]));
  for (const row of input.rows) {
    if (row.bucket === 'dropped') {
      continue;
    }
    const laneId = String(input.laneOf(row.userId) ?? '').trim();
    if (!laneId || !sums.has(laneId)) {
      continue;
    }
    sums.set(laneId, (sums.get(laneId) ?? 0) + Math.max(0, Number(row.points) || 0));
  }
  return input.lanes.map((lane) => ({
    id: lane.id,
    label: lane.label.trim() || lane.id,
    points: sums.get(lane.id) ?? 0,
  }));
}

/** Rookie → Rookies. Already-plural labels stay. Never hard-codes a company name. */
export function pluralizeLaneLabel(label: string): string {
  const raw = String(label ?? '').trim();
  if (!raw) {
    return raw;
  }
  if (/s$/i.test(raw)) {
    return raw;
  }
  if (/y$/i.test(raw) && !/[aeiou]y$/i.test(raw)) {
    return `${raw.slice(0, -1)}ies`;
  }
  return `${raw}s`;
}

export function comparableLaneHeaderLine(
  totals: BoardLaneSideTotal[],
  opts?: { prefix?: boolean },
): string {
  const body = totals.map((row) => `${row.label} ${formatBoardPoints(row.points)}`).join(' · ');
  if (opts?.prefix && body) {
    return `Sides · ${body}`;
  }
  return body;
}

export function pointsBoardHeaderLine(racingCount: number, leadingScore?: number | null): string {
  const racing = Math.max(0, racingCount);
  if (leadingScore != null && leadingScore > 0) {
    return `In ${racing} · Leading ${formatBoardPoints(leadingScore)}`;
  }
  return `${racing} racing`;
}

export function consistencyBoardHeaderLine(
  remainingCount: number,
  caughtUpCount: number,
  droppedCount: number,
): string {
  return `Remaining ${remainingCount} · Caught Up ${caughtUpCount} · Dropped ${droppedCount}`;
}

/** True when the status line and Show details still share one row on a 390pt card. */
export function boardHeaderSharesDetailsRow(
  line: string,
  hasDetails: boolean,
  compact = false,
): boolean {
  const pad = compact ? 12 : CARD_PAD;
  const details = hasDetails ? DETAILS_COL : 0;
  const gap = hasDetails ? HEADER_GAP : 0;
  const budget = PHONE_BOARD_WIDTH - pad * 2 - details - gap;
  return line.length * CHAR_PX <= budget;
}

export function boardStatusHeaderLine(input: {
  format: BoardHeaderFormat;
  racingCount: number;
  leadingScore?: number | null;
  remainingCount?: number;
  caughtUpCount?: number;
  droppedCount?: number;
  inCount?: number;
  doneCount?: number;
  laneTotals?: BoardLaneSideTotal[];
  sidesPrefix?: boolean;
}): string {
  if (input.format === 'quantity') {
    return quantityBoardHeaderLine(input.inCount ?? 0, input.doneCount ?? 0, input.droppedCount ?? 0);
  }
  if (input.format === 'lanes') {
    return comparableLaneHeaderLine(input.laneTotals ?? [], { prefix: input.sidesPrefix });
  }
  if (input.format === 'points') {
    return pointsBoardHeaderLine(input.racingCount, input.leadingScore);
  }
  return consistencyBoardHeaderLine(
    input.remainingCount ?? 0,
    input.caughtUpCount ?? 0,
    input.droppedCount ?? 0,
  );
}
