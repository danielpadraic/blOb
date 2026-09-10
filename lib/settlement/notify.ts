import { clipPushLine, namedChallengePhrase } from '@/lib/challengeNotifyName';
import { formatSettlementAmount, voidReceiptCopy, type SettlementVoidKind } from '@/lib/settlement/receipts';

export type SettlementNotifyInput = {
  displayName: string;
  title: string;
  objectPronoun?: string | null;
};

/** Same shape as check-in: `{Name} Settled @{title}. Congratulate {her/him/them}.` */
export function settledCongratulateCopy(input: SettlementNotifyInput): string {
  const name = input.displayName.trim() || 'Someone';
  const title = namedChallengePhrase(input.title.trim() || 'this challenge');
  const pronoun = input.objectPronoun?.trim() || 'them';
  return clipPushLine(`${name} Settled ${title}. Congratulate ${pronoun}.`);
}

export function forfeitNotifyCopy(title: string): string {
  const label = namedChallengePhrase(title.trim() || 'this challenge');
  return clipPushLine(`${label} settled. Nobody remaining. Prize forfeited.`);
}

export function voidNotifyCopy(
  title: string,
  kind: Exclude<SettlementVoidKind, 'historical_forfeit' | null>,
): string {
  const label = namedChallengePhrase(title.trim() || 'this challenge');
  return clipPushLine(`${label} settled. ${voidReceiptCopy(kind)}`);
}

export function payoutReceivedCopy(amountLabel: string, title: string): string {
  const label = namedChallengePhrase(title.trim() || 'this challenge');
  return clipPushLine(`You received ${amountLabel} from ${label}.`);
}

/** Winner push / in-app. Cash stays `$`, never the word Bucks. */
export function winnerSettledNotifyCopy(title: string, amountLabel: string): string {
  const label = namedChallengePhrase(title.trim() || 'this challenge');
  return clipPushLine(`${label} settled. ${amountLabel} is in your wallet.`);
}

export function splitSettledNotifyCopy(title: string, otherCount: number): string {
  const label = namedChallengePhrase(title.trim() || 'this challenge');
  const n = Math.max(Math.floor(otherCount), 1);
  return clipPushLine(`${label} settled. You split it with ${n}.`);
}

export function nonWinnerSettledNotifyCopy(title: string, winnerName: string): string {
  const label = namedChallengePhrase(title.trim() || 'this challenge');
  const name = winnerName.trim() || 'Someone';
  return clipPushLine(`${label} settled. ${name} took it.`);
}

export function walletAmountLabel(amount: number, currency?: string | null): string {
  if (String(currency ?? 'coins') === 'bucks') {
    return formatSettlementAmount(amount, 'bucks');
  }
  const coins = Math.round(Number(amount ?? 0));
  return `${coins} ${coins === 1 ? 'coin' : 'coins'}`;
}

export function lobbyResultCopy(input: {
  title: string;
  remaining: number;
  forfeited: boolean;
  voidKind?: SettlementVoidKind;
}): string {
  const title = namedChallengePhrase(input.title.trim() || 'this challenge');
  if (input.voidKind && input.voidKind !== 'historical_forfeit') {
    return clipPushLine(`${title} settled. ${voidReceiptCopy(input.voidKind)}`);
  }
  if (input.forfeited || input.remaining <= 0) {
    return clipPushLine(`${title} settled. Nobody remaining. Prize forfeited.`);
  }
  return clipPushLine(`${title} settled. ${input.remaining} remaining split the prize.`);
}
