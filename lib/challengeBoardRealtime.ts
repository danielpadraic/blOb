import type { RealtimeChannel } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';

import { reportAppError } from '@/lib/appErrors';
import { supabase } from '@/lib/supabase';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CHALLENGE_BOARD_CHANNEL_PREFIX = 'challenge-board:';

type BoardQueryClient = Pick<QueryClient, 'invalidateQueries'>;

export type ChallengeBoardRealtimeHost = {
  channel: (name: string) => RealtimeChannel;
  getChannels: () => RealtimeChannel[];
  removeChannel: (channel: RealtimeChannel) => unknown;
};

type BoardFlight = {
  challengeId: string;
  channel: RealtimeChannel;
  refs: number;
};

const flights = new Map<string, BoardFlight>();

export function isChallengeRealtimeId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function challengeBoardChannelName(challengeId: string): string {
  return `${CHALLENGE_BOARD_CHANNEL_PREFIX}${challengeId.trim()}`;
}

export function isChallengeBoardChannel(
  channel: { topic?: string | null },
  challengeId: string,
): boolean {
  const name = challengeBoardChannelName(challengeId);
  const topic = String(channel.topic ?? '');
  return topic === name || topic === `realtime:${name}`;
}

export function isRealtimeChannelLive(channel: { state?: string | null }): boolean {
  const state = String(channel.state ?? '').toLowerCase();
  return state === 'joined' || state === 'joining' || state === 'subscribed';
}

export function resetChallengeBoardRealtimeForTests(): void {
  flights.clear();
}

function logBoard(challengeId: string, event: string, error?: unknown): void {
  const message =
    error instanceof Error ? error.message : error == null ? null : String(error);
  console.log('[blob:board] realtime', { challengeId, event, error: message });
}

function hostOrDefault(host?: ChallengeBoardRealtimeHost): ChallengeBoardRealtimeHost {
  return host ?? supabase;
}

function findExistingChannel(
  challengeId: string,
  host: ChallengeBoardRealtimeHost,
): RealtimeChannel | undefined {
  return host.getChannels().find((channel) => isChallengeBoardChannel(channel, challengeId));
}

function bindBoardChannel(
  channel: RealtimeChannel,
  challengeId: string,
  queryClient: BoardQueryClient,
): void {
  const refreshBoard = () => {
    void queryClient.invalidateQueries({ queryKey: ['challenge-participants', challengeId] });
    void queryClient.invalidateQueries({ queryKey: ['my-participation', challengeId] });
    void queryClient.invalidateQueries({ queryKey: ['submitted-checkins', challengeId] });
    void queryClient.invalidateQueries({ queryKey: ['challenge-completions', challengeId] });
    void queryClient.invalidateQueries({ queryKey: ['logged-workout-days', challengeId] });
    void queryClient.invalidateQueries({ queryKey: ['my-challenge-progress'] });
  };
  const refreshFeed = () => {
    void queryClient.invalidateQueries({ queryKey: ['feed', challengeId] });
  };
  const refreshSettlement = () => {
    void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
    void queryClient.invalidateQueries({ queryKey: ['challenge-settlement', challengeId] });
    void queryClient.invalidateQueries({ queryKey: ['wallet-ledger'] });
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    refreshBoard();
    refreshFeed();
  };

  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'challenge_participants',
        filter: `challenge_id=eq.${challengeId}`,
      },
      refreshBoard,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'challenge_checkins',
        filter: `challenge_id=eq.${challengeId}`,
      },
      refreshBoard,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'posts',
        filter: `challenge_id=eq.${challengeId}`,
      },
      refreshFeed,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'challenges',
        filter: `id=eq.${challengeId}`,
      },
      refreshSettlement,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'challenge_settlements',
        filter: `challenge_id=eq.${challengeId}`,
      },
      refreshSettlement,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'challenge_payouts',
        filter: `challenge_id=eq.${challengeId}`,
      },
      refreshSettlement,
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        logBoard(challengeId, status);
      }
    });
}

/**
 * One `challenge-board:{id}` channel. Reuse if already subscribed.
 * Never adds a second postgres_changes callback. Never throws.
 */
export function acquireChallengeBoardRealtime(
  challengeId: string,
  queryClient: BoardQueryClient,
  host?: ChallengeBoardRealtimeHost,
): RealtimeChannel | null {
  const id = challengeId.trim();
  try {
    if (!isChallengeRealtimeId(id)) {
      return null;
    }

    const client = hostOrDefault(host);
    const held = flights.get(id);
    if (held) {
      held.refs += 1;
      return held.channel;
    }

    const existing = findExistingChannel(id, client);
    if (existing && isRealtimeChannelLive(existing)) {
      flights.set(id, { challengeId: id, channel: existing, refs: 1 });
      return existing;
    }
    if (existing) {
      try {
        void client.removeChannel(existing);
      } catch (error) {
        logBoard(id, 'remove-stale', error);
      }
    }

    const channel = client.channel(challengeBoardChannelName(id));
    if (isRealtimeChannelLive(channel)) {
      flights.set(id, { challengeId: id, channel, refs: 1 });
      return channel;
    }

    try {
      bindBoardChannel(channel, id, queryClient);
    } catch (error) {
      logBoard(id, 'subscribe', error);
      reportAppError({
        route: 'challenge/board-realtime',
        error,
        payload: { challengeId: id, event: 'subscribe' },
      });
      try {
        void client.removeChannel(channel);
      } catch (removeError) {
        logBoard(id, 'remove-failed-bind', removeError);
      }
      return null;
    }
    flights.set(id, { challengeId: id, channel, refs: 1 });
    return channel;
  } catch (error) {
    logBoard(id, 'subscribe', error);
    reportAppError({
      route: 'challenge/board-realtime',
      error,
      payload: { challengeId: id, event: 'subscribe' },
    });
    return null;
  }
}

/** Drop the flight when the last lobby unmounts. Safe to call twice. Never throws. */
export function releaseChallengeBoardRealtime(
  challengeId: string,
  host?: ChallengeBoardRealtimeHost,
): void {
  const id = challengeId.trim();
  try {
    if (!isChallengeRealtimeId(id)) {
      return;
    }
    const client = hostOrDefault(host);
    const held = flights.get(id);
    if (held) {
      held.refs -= 1;
      if (held.refs > 0) {
        return;
      }
      flights.delete(id);
      void client.removeChannel(held.channel);
      return;
    }
    const leftover = findExistingChannel(id, client);
    if (leftover) {
      void client.removeChannel(leftover);
    }
  } catch (error) {
    logBoard(id, 'unsubscribe', error);
  }
}
