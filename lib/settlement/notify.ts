import { voidReceiptCopy, type SettlementVoidKind } from '@/lib/settlement/receipts';

export type SettlementNotifyInput = {
  displayName: string;
  title: string;
  objectPronoun?: string | null;
};

/** Same shape as check-in: `{Name} Settled @{title}. Congratulate {her/him/them}.` */
export function settledCongratulateCopy(input: SettlementNotifyInput): string {
  const name = input.displayName.trim() || 'Someone';
  const title = input.title.trim() || 'this challenge';
  const pronoun = input.objectPronoun?.trim() || 'them';
  return `${name} Settled @${title}. Congratulate ${pronoun}.`;
}

export function forfeitNotifyCopy(title: string): string {
  const label = title.trim() || 'this challenge';
  return `${label} settled. Nobody remaining. Prize forfeited.`;
}

export function voidNotifyCopy(
  title: string,
  kind: Exclude<SettlementVoidKind, 'historical_forfeit' | null>,
): string {
  const label = title.trim() || 'this challenge';
  return `${label} settled. ${voidReceiptCopy(kind)}`;
}

export function payoutReceivedCopy(amountLabel: string, title: string): string {
  const label = title.trim() || 'this challenge';
  return `You received ${amountLabel} from @${label}.`;
}

export function lobbyResultCopy(input: {
  title: string;
  remaining: number;
  forfeited: boolean;
  voidKind?: SettlementVoidKind;
}): string {
  const title = input.title.trim() || 'this challenge';
  if (input.voidKind && input.voidKind !== 'historical_forfeit') {
    return `${title} settled. ${voidReceiptCopy(input.voidKind)}`;
  }
  if (input.forfeited || input.remaining <= 0) {
    return `${title} settled. Nobody remaining. Prize forfeited.`;
  }
  return `${title} settled. ${input.remaining} remaining split the prize.`;
}
