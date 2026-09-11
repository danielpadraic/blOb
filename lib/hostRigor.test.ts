import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HOST_RIGOR,
  hostRigorControlState,
  hostRigorForPublish,
  hostRigorOf,
  hostRigorReviewLine,
  officialCashPublishRejected,
  viewerCanEditBoardScore,
  viewerCanFriendlyHostAdd,
  viewerCanNormalHostAdjust,
  viewerCanUseHostBoardTools,
} from '@/lib/hostRigor';

describe('host rigor', () => {
  it('reads a null rigor as Normal', () => {
    expect(DEFAULT_HOST_RIGOR).toBe('normal');
    expect(hostRigorOf({ host_rigor: null })).toBe('normal');
    expect(hostRigorOf({})).toBe('normal');
    expect(hostRigorReviewLine(null)).toMatch(/^Normal/);
  });

  it('forces Official cash to Strict and rejects anything else on publish', () => {
    const officialCash = { is_official: true, currency: 'bucks' };
    expect(hostRigorControlState(officialCash)).toEqual({
      value: 'strict',
      disabled: true,
      options: ['strict'],
      helper: 'Official cash contests stay Strict.',
    });
    expect(
      hostRigorForPublish({
        hostRigor: 'friendly',
        isOfficial: true,
        currency: 'bucks',
      }),
    ).toBe('strict');
    expect(
      officialCashPublishRejected({
        isOfficial: true,
        currency: 'bucks',
        hostRigor: 'normal',
      }),
    ).toBe(true);
    expect(
      officialCashPublishRejected({
        isOfficial: true,
        currency: 'bucks',
        hostRigor: 'strict',
      }),
    ).toBe(false);
  });

  it('lets Official coins pick Friendly or Normal only', () => {
    const state = hostRigorControlState({ is_official: true, currency: 'coins', host_rigor: 'normal' });
    expect(state.disabled).toBe(false);
    expect(state.options).toEqual(['friendly', 'normal']);
    expect(
      hostRigorForPublish({
        hostRigor: 'strict',
        isOfficial: true,
        currency: 'coins',
      }),
    ).toBe('normal');
  });

  it('lets a Friendly host add after the join window; Normal cannot', () => {
    const live = { created_by: 'host', status: 'live' };
    expect(
      viewerCanFriendlyHostAdd({
        challenge: { ...live, host_rigor: 'friendly' },
        viewerId: 'host',
      }),
    ).toBe(true);
    expect(
      viewerCanFriendlyHostAdd({
        challenge: { ...live, host_rigor: 'normal' },
        viewerId: 'host',
      }),
    ).toBe(false);
    expect(
      viewerCanFriendlyHostAdd({
        challenge: { ...live, host_rigor: null },
        viewerId: 'host',
      }),
    ).toBe(false);
    expect(
      viewerCanFriendlyHostAdd({
        challenge: { ...live, host_rigor: 'friendly', status: 'settled' },
        viewerId: 'host',
      }),
    ).toBe(false);
  });

  it('hides Board tools on Strict and keeps them for Normal / Friendly / @blob', () => {
    const live = { created_by: 'host', status: 'live' };
    expect(
      viewerCanUseHostBoardTools({
        challenge: { ...live, host_rigor: 'strict' },
        viewerId: 'host',
      }),
    ).toBe(false);
    expect(
      viewerCanNormalHostAdjust({
        challenge: { ...live, host_rigor: 'normal' },
        viewerId: 'host',
      }),
    ).toBe(true);
    expect(
      viewerCanNormalHostAdjust({
        challenge: { ...live, host_rigor: null },
        viewerId: 'host',
      }),
    ).toBe(true);
    expect(
      viewerCanUseHostBoardTools({
        challenge: { ...live, host_rigor: 'strict', is_official: true, series_id: 'week_10' },
        viewerId: 'blob',
        officialOps: true,
      }),
    ).toBe(true);
    expect(
      viewerCanEditBoardScore({
        challenge: { ...live, host_rigor: 'friendly' },
        viewerId: 'host',
      }),
    ).toBe(true);
    expect(
      viewerCanEditBoardScore({
        challenge: { ...live, host_rigor: 'normal' },
        viewerId: 'host',
      }),
    ).toBe(false);
  });
});
