import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RealtimeChannel } from '@supabase/supabase-js';

import {
  acquireChallengeBoardRealtime,
  challengeBoardChannelName,
  isChallengeBoardChannel,
  isChallengeRealtimeId,
  isRealtimeChannelLive,
  releaseChallengeBoardRealtime,
  resetChallengeBoardRealtimeForTests,
  type ChallengeBoardRealtimeHost,
} from '@/lib/challengeBoardRealtime';

const ID = '2f1d8a10-4c3b-4a91-9e2a-0b6c7d8e9f10';

function mockQueryClient() {
  return { invalidateQueries: vi.fn() };
}

function mockChannel(state = 'closed'): RealtimeChannel & { onCalls: number } {
  const channel = {
    topic: challengeBoardChannelName(ID),
    state,
    onCalls: 0,
    on: vi.fn(function (this: RealtimeChannel) {
      channel.onCalls += 1;
      return this;
    }),
    subscribe: vi.fn(function (this: RealtimeChannel) {
      return this;
    }),
  };
  return channel as unknown as RealtimeChannel & { onCalls: number };
}

function mockHost(channel = mockChannel()): {
  host: ChallengeBoardRealtimeHost;
  channel: RealtimeChannel & { onCalls: number };
} {
  const live = isRealtimeChannelLive(channel);
  const channels: RealtimeChannel[] = live ? [channel] : [];
  const host: ChallengeBoardRealtimeHost = {
    getChannels: () => channels,
    channel: vi.fn(() => {
      if (!channels.includes(channel)) {
        channels.push(channel);
      }
      return channel;
    }),
    removeChannel: vi.fn((item) => {
      const index = channels.indexOf(item);
      if (index >= 0) {
        channels.splice(index, 1);
      }
    }),
  };
  return { host, channel };
}

describe('challenge board realtime id', () => {
  it('only accepts a real uuid', () => {
    expect(isChallengeRealtimeId(ID)).toBe(true);
    expect(isChallengeRealtimeId(` ${ID} `)).toBe(true);
    expect(isChallengeRealtimeId('')).toBe(false);
    expect(isChallengeRealtimeId('challenge-board')).toBe(false);
    expect(isChallengeRealtimeId('undefined')).toBe(false);
    expect(isChallengeRealtimeId('[id]')).toBe(false);
  });

  it('names the channel challenge-board:{id}', () => {
    expect(challengeBoardChannelName(ID)).toBe(`challenge-board:${ID}`);
    expect(isChallengeBoardChannel({ topic: `challenge-board:${ID}` }, ID)).toBe(true);
    expect(isChallengeBoardChannel({ topic: `realtime:challenge-board:${ID}` }, ID)).toBe(true);
    expect(isRealtimeChannelLive({ state: 'joined' })).toBe(true);
    expect(isRealtimeChannelLive({ state: 'joining' })).toBe(true);
    expect(isRealtimeChannelLive({ state: 'closed' })).toBe(false);
  });
});

describe('acquireChallengeBoardRealtime', () => {
  beforeEach(() => {
    resetChallengeBoardRealtimeForTests();
  });

  it('binds postgres_changes once and reuses the same channel', () => {
    const { host, channel } = mockHost();
    const first = acquireChallengeBoardRealtime(ID, mockQueryClient(), host);
    const second = acquireChallengeBoardRealtime(ID, mockQueryClient(), host);
    expect(first).toBe(channel);
    expect(second).toBe(channel);
    expect(channel.onCalls).toBeGreaterThan(0);
    const bound = channel.onCalls;
    expect(acquireChallengeBoardRealtime(ID, mockQueryClient(), host)).toBe(channel);
    expect(channel.onCalls).toBe(bound);
    expect(host.channel).toHaveBeenCalledTimes(1);
  });

  it('does not add callbacks when the topic is already live', () => {
    const { host, channel } = mockHost(mockChannel('joined'));
    channel.on = vi.fn(() => {
      throw new Error('cannot add `postgres_changes` callbacks for realtime:challenge-board');
    });
    expect(() => acquireChallengeBoardRealtime(ID, mockQueryClient(), host)).not.toThrow();
    expect(channel.on).not.toHaveBeenCalled();
  });

  it('never throws when postgres_changes bind fails', () => {
    const { host, channel } = mockHost(mockChannel('closed'));
    channel.on = vi.fn(() => {
      throw new Error('cannot add `postgres_changes` callbacks for realtime:challenge-board');
    });
    expect(() => acquireChallengeBoardRealtime(ID, mockQueryClient(), host)).not.toThrow();
    expect(acquireChallengeBoardRealtime(ID, mockQueryClient(), host)).toBeNull();
  });

  it('never throws when subscribe fails', () => {
    const { host } = mockHost();
    host.channel = vi.fn(() => {
      throw new Error('cannot add `postgres_changes` callbacks for realtime:challenge-board');
    });
    expect(acquireChallengeBoardRealtime(ID, mockQueryClient(), host)).toBeNull();
  });

  it('unsubscribes only after the last release', () => {
    const { host, channel } = mockHost();
    acquireChallengeBoardRealtime(ID, mockQueryClient(), host);
    acquireChallengeBoardRealtime(ID, mockQueryClient(), host);
    releaseChallengeBoardRealtime(ID, host);
    expect(host.removeChannel).not.toHaveBeenCalled();
    releaseChallengeBoardRealtime(ID, host);
    expect(host.removeChannel).toHaveBeenCalledWith(channel);
    releaseChallengeBoardRealtime(ID, host);
  });

  it('skips subscribe when the id is not a uuid', () => {
    const { host } = mockHost();
    expect(acquireChallengeBoardRealtime('not-a-uuid', mockQueryClient(), host)).toBeNull();
    expect(host.channel).not.toHaveBeenCalled();
  });
});
