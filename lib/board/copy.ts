import { FORFEIT_RECEIPT } from '@/lib/settlement/receipts';

import type { BoardView } from './model';

export const BOARD_INFO = {
  remaining: {
    title: 'Remaining',
    body: 'Still in. Proven by check-in progress. They split the prize if they finish.',
  },
  caughtUp: {
    title: 'Caught Up',
    body: 'Remaining people who already submitted today’s required proof.',
  },
  dropped: {
    title: 'Dropped',
    body: 'Missed a required check-in, left, or were removed. They do not share the prize.',
  },
  settled: {
    title: 'Settled',
    body: 'The prize is paid. Remaining on this board are the people who finished.',
  },
  forfeit: {
    title: 'Forfeit',
    body: FORFEIT_RECEIPT,
  },
} as const;

export function boardEmptyCopy(view: Pick<BoardView, 'settled' | 'spectator'>): string {
  if (view.settled) {
    return 'This challenge settled with nobody on the board.';
  }
  if (view.spectator) {
    return 'Join to appear on the board. Remaining show up after the first proven check-in.';
  }
  return 'Empty until people join and check in.';
}

export function boardSettledCopy(view: Pick<BoardView, 'forfeited' | 'youPaid' | 'spectator' | 'remainingCount'>): {
  title: string;
  body: string;
  showBob: boolean;
} {
  if (view.forfeited) {
    return {
      title: 'Settled',
      body: FORFEIT_RECEIPT,
      showBob: false,
    };
  }
  if (view.youPaid) {
    return {
      title: 'You got paid.',
      body: 'The receipt is yours to keep.',
      showBob: true,
    };
  }
  if (view.spectator) {
    return {
      title: 'Settled',
      body: `${view.remainingCount} remaining split the prize.`,
      showBob: false,
    };
  }
  return {
    title: 'Settled',
    body: 'No payout this time.',
    showBob: false,
  };
}

export function boardRowTag(person: { bucket: string; you?: boolean }, settled: boolean): string {
  if (person.you) {
    return 'You';
  }
  if (settled) {
    return person.bucket === 'dropped' ? 'Out' : 'Paid';
  }
  if (person.bucket === 'caught_up') {
    return 'Done';
  }
  if (person.bucket === 'dropped') {
    return 'Out';
  }
  return 'In';
}

export function assertsNoBucksWord(value: string): boolean {
  return !/bucks/i.test(value);
}
