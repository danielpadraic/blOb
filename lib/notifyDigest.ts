/** Winner + check-in Bell copy. Keep in lockstep with SQL winner_digest_line. */

import type { AppNotification } from '@/lib/types';

function challengeIdOf(item: AppNotification): string | undefined {
  return item.data?.challenge_id ?? item.data?.challengeId;
}

export function winnerDigestLine(input: {
  challengeTitle: string;
  friendNames: string[];
  viewerFinished: boolean;
}): string {
  const title = input.challengeTitle.trim() || 'this challenge';
  const names = input.friendNames.map((name) => name.trim()).filter(Boolean);
  const n = names.length;

  if (input.viewerFinished) {
    if (n === 0) {
      return `Nice work! You finished ${title}.`;
    }
    if (n === 1) {
      return `Nice work! You and ${names[0]} all won ${title}! Send a high-five!`;
    }
    if (n === 2) {
      return `Nice work! You, ${names[0]}, and ${names[1]} all won ${title}! Send a high-five!`;
    }
    if (n === 3) {
      return `Nice work! You, ${names[0]}, ${names[1]}, and ${names[2]} all won ${title}! Send a high-five!`;
    }
    return `Nice work! You, ${names[0]}, ${names[1]}, and ${n - 2} others all won ${title}! Send a high-five!`;
  }

  if (n === 0) {
    return `${title} ended.`;
  }
  if (n === 1) {
    return `${names[0]} won ${title}.`;
  }
  if (n === 2) {
    return `${names[0]} and ${names[1]} won ${title}.`;
  }
  if (n === 3) {
    return `${names[0]}, ${names[1]}, and ${names[2]} won ${title}.`;
  }
  return `${names[0]}, ${names[1]}, and ${n - 2} others won ${title}.`;
}

export function checkinDigestLine(input: {
  challengeTitle: string;
  count: number;
  name?: string | null;
  pronoun?: string | null;
}): string {
  const title = input.challengeTitle.trim() || 'this challenge';
  if (input.count <= 1) {
    const name = input.name?.trim() || 'Someone';
    const pronoun = input.pronoun?.trim() || 'them';
    return `${name} Check-In @${title}. Congratulate ${pronoun}.`;
  }
  return `${input.count} friends checked in on ${title}.`;
}

export function highFiveDraft(challengeTitle?: string | null): string {
  const title = challengeTitle?.trim() || 'this challenge';
  return `High five — we all finished ${title}!`;
}

export function settleDedupeKey(challengeId: string, userId: string): string {
  return `settle:${challengeId}:${userId}`;
}

export function checkinDigestDedupeKey(
  challengeId: string,
  viewerId: string,
  periodKey: string,
): string {
  return `checkin-digest:${challengeId}:${viewerId}:${periodKey}`;
}

const SETTLE_COLLAPSE_TYPES = new Set([
  'challenge_settled',
  'challenge_won',
  'challenge_placed',
  'payout_received',
]);

function settleCollapseKey(item: AppNotification): string | null {
  if (!SETTLE_COLLAPSE_TYPES.has(item.type)) {
    return null;
  }
  const challengeId = challengeIdOf(item);
  return challengeId ? `settle:${challengeId}` : null;
}

function checkinCollapseKey(item: AppNotification): string | null {
  if (item.type !== 'challenge_checkin') {
    return null;
  }
  const challengeId = challengeIdOf(item);
  if (!challengeId) {
    return null;
  }
  const period = item.data.period_key || item.created_at.slice(0, 10);
  return `checkin:${challengeId}:${period}`;
}

function preferSettleRow(current: AppNotification, next: AppNotification): AppNotification {
  const currentHighFive = Boolean(current.data.high_five);
  const nextHighFive = Boolean(next.data.high_five);
  if (nextHighFive && !currentHighFive) {
    return next;
  }
  if (current.type !== 'challenge_settled' && next.type === 'challenge_settled') {
    return next;
  }
  return current;
}

function mergeSettleRow(keep: AppNotification, other: AppNotification): void {
  keep.data = {
    ...other.data,
    ...keep.data,
    amount: keep.data.amount ?? other.data.amount,
    winner_ids: keep.data.winner_ids ?? other.data.winner_ids,
    high_five: Boolean(keep.data.high_five || other.data.high_five),
  };
  if (!keep.read_at || (other.read_at && other.read_at < keep.read_at)) {
    keep.read_at = other.read_at ?? keep.read_at;
  }
  if (other.read_at == null) {
    keep.read_at = null;
  }
}

/** One settle row and one check-in row per challenge (+ period). Leftover payout/won/placed drop. */
export function collapseChallengeDigests(items: AppNotification[]): AppNotification[] {
  const settleSeen = new Map<string, AppNotification>();
  const checkinSeen = new Map<string, AppNotification>();
  const out: AppNotification[] = [];

  for (const item of items) {
    const settleKey = settleCollapseKey(item);
    if (settleKey) {
      const current = settleSeen.get(settleKey);
      if (!current) {
        settleSeen.set(settleKey, item);
        out.push(item);
        continue;
      }
      const preferred = preferSettleRow(current, item);
      if (preferred !== current) {
        mergeSettleRow(preferred, current);
        const index = out.indexOf(current);
        if (index >= 0) {
          out[index] = preferred;
        }
        settleSeen.set(settleKey, preferred);
      } else {
        mergeSettleRow(current, item);
      }
      continue;
    }

    const checkinKey = checkinCollapseKey(item);
    if (checkinKey) {
      const current = checkinSeen.get(checkinKey);
      if (!current) {
        checkinSeen.set(checkinKey, item);
        out.push(item);
        continue;
      }
      const ids = new Set<string>();
      for (const id of current.data.actor_ids ?? []) {
        if (id) ids.add(id);
      }
      for (const id of item.data.actor_ids ?? []) {
        if (id) ids.add(id);
      }
      if (current.actor_id) ids.add(current.actor_id);
      if (item.actor_id) ids.add(item.actor_id);
      const count = Math.max(ids.size, Number(current.data.count) || 1, Number(item.data.count) || 1);
      const title = current.data.challenge_title || item.data.challenge_title || 'this challenge';
      current.data = {
        ...current.data,
        actor_ids: [...ids],
        count,
        period_key: current.data.period_key ?? item.data.period_key,
        challenge_title: title,
      };
      current.title = checkinDigestLine({
        challengeTitle: title,
        count,
        name: current.actor?.display_name || current.actor?.username,
      });
      if (!current.read_at || (item.read_at && item.read_at < current.read_at)) {
        current.read_at = item.read_at ?? current.read_at;
      }
      if (item.read_at == null) {
        current.read_at = null;
      }
      continue;
    }

    out.push(item);
  }

  return out;
}
