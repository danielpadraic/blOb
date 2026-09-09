import { describe, expect, it } from 'vitest';

import {
  challengeIsEndedForAdjust,
  challengeIsOfficialLocked,
  challengeTracksMissesForExcuse,
  challengeUsesConsistencyAdjustBoard,
  HOST_ADJUST_HONOR_SOURCE,
  hostAdjustErrorMessage,
  participantCanBeAdjusted,
  viewerCanAdjustBoard,
} from '@/lib/hostAdjust';

describe('host Board adjust gates', () => {
  const liveUser = {
    created_by: 'host',
    status: 'live',
    is_official: false,
    series_id: null,
    host_budget: 0,
    challenge_type: 'consistency',
    format: 'consistency',
    frequency: 'daily',
    misses_allowed: 2,
  };

  it('prints Meredith-style honor, not HealthKit', () => {
    expect(HOST_ADJUST_HONOR_SOURCE.proof_kind).toBe('honor');
    expect(HOST_ADJUST_HONOR_SOURCE.proof_parts).toEqual({ honor: { method: 'honor' } });
  });

  it('shows the menu for host on a live user-created consistency Board', () => {
    expect(viewerCanAdjustBoard(liveUser, 'host')).toBe(true);
    expect(viewerCanAdjustBoard(liveUser, 'friend')).toBe(false);
    expect(viewerCanAdjustBoard(liveUser, 'mod', ['mod'])).toBe(true);
  });

  it('hides Official Weekly / guaranteed / ended', () => {
    expect(challengeIsOfficialLocked({ ...liveUser, is_official: true, series_id: 'week_10' })).toBe(true);
    expect(challengeIsOfficialLocked({ ...liveUser, host_budget: 10 })).toBe(true);
    expect(challengeIsEndedForAdjust({ status: 'ended' })).toBe(true);
    expect(challengeIsEndedForAdjust({ status: 'settled' })).toBe(true);
    expect(viewerCanAdjustBoard({ ...liveUser, is_official: true, series_id: 'week_10' }, 'host')).toBe(
      false,
    );
    expect(viewerCanAdjustBoard({ ...liveUser, status: 'ended' }, 'host')).toBe(false);
  });

  it('hides miles and points Boards', () => {
    expect(challengeUsesConsistencyAdjustBoard({ ...liveUser, format: 'cumulative' })).toBe(false);
    expect(challengeUsesConsistencyAdjustBoard({ ...liveUser, scoring_method: 'comparable_points' })).toBe(
      false,
    );
    expect(challengeUsesConsistencyAdjustBoard({ ...liveUser, privacy_mode: 'private_corporate' })).toBe(
      true,
    );
  });

  it('lets dropped participants be adjusted, not refunded', () => {
    expect(participantCanBeAdjusted('eliminated')).toBe(true);
    expect(participantCanBeAdjusted('joined')).toBe(true);
    expect(participantCanBeAdjusted('refunded_pre_start')).toBe(false);
  });

  it('only offers Excuse when misses are tracked', () => {
    expect(challengeTracksMissesForExcuse(liveUser)).toBe(true);
    expect(challengeTracksMissesForExcuse({ ...liveUser, format: 'cumulative' })).toBe(false);
  });

  it('maps RPC errors to the four locked lines', () => {
    expect(hostAdjustErrorMessage('Only the host can change the Board.')).toBe(
      'Only the host can change the Board.',
    );
    expect(hostAdjustErrorMessage('This Official challenge can’t be adjusted.')).toBe(
      'This Official challenge can’t be adjusted.',
    );
    expect(hostAdjustErrorMessage('That day already counts.')).toBe('That day already counts.');
    expect(hostAdjustErrorMessage('This challenge has already ended.')).toBe(
      'This challenge has already ended.',
    );
  });
});
