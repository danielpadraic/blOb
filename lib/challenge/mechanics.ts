import { prizeStructureSummary, requiredChallengeProofs } from '@/lib/challenges';
import { challengeRuleCopy } from '@/lib/challengeRuleCopy';
import { proofDisplayName } from '@/lib/challengeProofs';
import { formatCash, formatWalletNumber, isBucksChallenge } from '@/lib/currency';
import { missesAllowedCap } from '@/lib/missDuty';
import type { Challenge } from '@/lib/types';

type MechanicsChallenge = Challenge & {
  allowed_misses?: number | null;
  host_funded?: boolean | null;
  prize_guarantee_coins?: number | null;
};

function buyInOf(challenge: MechanicsChallenge): number {
  return Math.max(Number(challenge.buy_in_amount) || 0, 0);
}

export function joinNeedsConfirmSheet(challenge: MechanicsChallenge): boolean {
  const pool = Math.max(Number(challenge.prize_pool) || 0, 0);
  const guarantee = Math.max(Number(challenge.prize_guarantee_coins) || 0, 0);
  return buyInOf(challenge) > 0 || pool > 0 || guarantee > 0 || Boolean(challenge.is_official);
}

/** Large pay line. Cash stays `$`. Coins read as credits. */
export function joinPayLine(challenge: MechanicsChallenge): string {
  const amount = buyInOf(challenge);
  if (amount <= 0) {
    return 'Host-funded — no entry fee';
  }
  if (isBucksChallenge(challenge)) {
    return `You’re paying ${formatCash(amount)}`;
  }
  const credits = formatWalletNumber(amount);
  return `You’re paying ${credits} ${credits === '1' ? 'credit' : 'credits'}`;
}

export function joinCtaLabel(challenge: MechanicsChallenge): string {
  const amount = buyInOf(challenge);
  if (amount <= 0) {
    return 'Join — free';
  }
  if (isBucksChallenge(challenge)) {
    return `Join for ${formatCash(amount)}`;
  }
  const credits = formatWalletNumber(amount);
  return `Join for ${credits} ${credits === '1' ? 'credit' : 'credits'}`;
}

export function prizeSplitLine(challenge: MechanicsChallenge): string {
  return prizeStructureSummary(challenge);
}

export function prizePoolLine(challenge: MechanicsChallenge): string {
  const pool = Math.max(Number(challenge.prize_pool) || 0, 0);
  const guarantee = Math.max(Number(challenge.prize_guarantee_coins) || 0, 0);
  if (isBucksChallenge(challenge)) {
    return pool > 0 ? `Prize ${formatCash(pool)}` : 'Prize is funded by the host';
  }
  const shown = pool > 0 ? pool : guarantee;
  if (shown <= 0) {
    return 'Prize is funded by the host';
  }
  return `Prize ${formatWalletNumber(shown)} credits`;
}

export function refundBeforeStartLine(challenge: MechanicsChallenge): string | null {
  if (buyInOf(challenge) <= 0) {
    return null;
  }
  return 'If you drop out before start, you get a full refund.';
}

export function allowedMissesLine(challenge: MechanicsChallenge): string {
  const cap = missesAllowedCap(challenge);
  if (cap == null) {
    return 'Missed check-ins are not part of this challenge.';
  }
  if (cap <= 0) {
    return 'No misses. Miss a required check-in and you are out.';
  }
  const word = cap === 1 ? 'check-in' : 'check-ins';
  return `You can miss ${cap} required ${word}. One more and you are out.`;
}

export function requiredProofLine(challenge: MechanicsChallenge): string {
  const proofs = requiredChallengeProofs(challenge).filter((proof) => proof.method !== 'honor');
  if (proofs.length === 0) {
    return 'Check in on your honor.';
  }
  const names = proofs.map((proof) => proofDisplayName(proof).replace(/\.+$/, ''));
  if (names.length === 1) {
    return names[0];
  }
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export function scoringRuleLine(challenge: MechanicsChallenge): string {
  const primary = String(challengeRuleCopy(challenge).primary ?? '').trim();
  const sentence = primary.split(/(?<=[.])\s/)[0]?.trim();
  if (sentence) {
    return sentence;
  }
  return prizeSplitLine(challenge);
}
