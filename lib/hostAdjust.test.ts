import { describe, expect, it } from 'vitest';

import {
  challengeIsEndedForAdjust,
  challengeIsOfficialLocked,
  challengeTracksMissesForExcuse,
  challengeUsesConsistencyAdjustBoard,
  HOST_ADJUST_HONOR_SOURCE,
  formatHostAdjustPeople,
  hostAdjustActorName,
  hostAdjustConfirmLine,
  hostAdjustErrorMessage,
  hostAdjustLiveBody,
  hostAdjustLivePostRow,
  hostAdjustSkipLines,
  participantCanBeAdjusted,
  planHostAdjustBulk,
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
    expect(viewerCanAdjustBoard({ ...liveUser, host_rigor: null }, 'host')).toBe(true);
    expect(viewerCanAdjustBoard(liveUser, 'friend')).toBe(false);
    expect(viewerCanAdjustBoard(liveUser, 'mod', ['mod'])).toBe(true);
  });

  it('hides Board tools when the host published Strict', () => {
    expect(viewerCanAdjustBoard({ ...liveUser, host_rigor: 'strict' }, 'host')).toBe(false);
    expect(viewerCanAdjustBoard({ ...liveUser, host_rigor: 'strict' }, 'blob', [], true)).toBe(true);
  });

  it('lets a Friendly host adjust a guaranteed corporate room', () => {
    expect(
      challengeIsOfficialLocked({ ...liveUser, host_budget: 10, host_rigor: 'friendly' }),
    ).toBe(false);
    expect(
      viewerCanAdjustBoard({ ...liveUser, host_budget: 10, host_rigor: 'friendly' }, 'host'),
    ).toBe(true);
  });

  it('hides Official Weekly / guaranteed / ended', () => {
    expect(challengeIsOfficialLocked({ ...liveUser, is_official: true, series_id: 'week_10' })).toBe(true);
    expect(challengeIsOfficialLocked({ ...liveUser, host_budget: 10 })).toBe(true);
    expect(challengeIsEndedForAdjust({ status: 'ended' })).toBe(true);
    expect(challengeIsEndedForAdjust({ status: 'settled' })).toBe(true);
    expect(viewerCanAdjustBoard({ ...liveUser, is_official: true, series_id: 'week_10' }, 'host')).toBe(
      false,
    );
    expect(
      viewerCanAdjustBoard({ ...liveUser, is_official: true, series_id: 'week_10' }, 'blob', [], true),
    ).toBe(true);
    expect(viewerCanAdjustBoard({ ...liveUser, status: 'ended' }, 'host')).toBe(false);
    expect(viewerCanAdjustBoard({ ...liveUser, status: 'settled' }, 'blob', [], true)).toBe(false);
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

  it('maps RPC errors to the locked lines and never dumps SQLSTATE', () => {
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
    expect(hostAdjustErrorMessage('They don’t have a miss to excuse.')).toBe(
      'They don’t have a miss to excuse.',
    );
    expect(
      hostAdjustErrorMessage(
        '55000 record "v_win" is not assigned yet The tuple structure of a not-yet-assigned record is indeterminate.',
      ),
    ).toBe('They don’t have a miss to excuse.');
    expect(
      hostAdjustErrorMessage('23505 duplicate key value violates unique constraint "posts_system_kind_uidx"'),
    ).toBe('Couldn’t update the Board.');
    expect(hostAdjustErrorMessage('Courtney: They don’t have a miss to excuse.')).toBe(
      'Courtney — They don’t have a miss to excuse.',
    );
  });
});

describe('host adjust Live note', () => {
  it('appends the caption under the action sentence', () => {
    expect(
      hostAdjustLiveBody({
        action: 'excuse_miss',
        displayName: 'Josh',
        actorName: 'Daniel Harder',
        caption: '  Weather delay.  ',
      }),
    ).toBe('Daniel Harder excused a miss for Josh.\n\nWeather delay.');
  });

  it('prints Count / Excuse / Remove defaults', () => {
    expect(hostAdjustLiveBody({ action: 'count_honor', displayName: 'Silas', dayN: 3 })).toBe(
      'Host counted Day 3 for Silas.',
    );
    expect(hostAdjustLiveBody({ action: 'excuse_miss', displayName: 'Josh' })).toBe(
      'Host excused a miss for Josh.',
    );
    expect(hostAdjustLiveBody({ action: 'remove_counted', displayName: 'Silas', dayN: 3 })).toBe(
      'Host removed Day 3 for Silas.',
    );
  });

  it('names the actor and bulk people on one sentence', () => {
    expect(
      hostAdjustLiveBody({
        action: 'excuse_miss',
        displayName: 'Courtney',
        actorName: 'Daniel Harder',
      }),
    ).toBe('Daniel Harder excused a miss for Courtney.');
    expect(
      hostAdjustLiveBody({
        action: 'excuse_miss',
        names: ['Courtney'],
        count: 3,
        actorName: 'Daniel Harder',
      }),
    ).toBe('Daniel Harder excused 3 misses for Courtney.');
    expect(
      hostAdjustLiveBody({
        action: 'excuse_miss',
        names: ['Courtney', 'Silas', 'Gloria'],
        count: 3,
        actorName: 'Daniel Harder',
      }),
    ).toBe('Daniel Harder excused 3 misses for Courtney, Silas, and Gloria.');
    expect(
      hostAdjustLiveBody({
        action: 'count_honor',
        names: ['Courtney', 'Silas'],
        count: 2,
        actorName: 'Daniel Harder',
      }),
    ).toBe('Daniel Harder counted 2 days for Courtney and Silas.');
    expect(
      hostAdjustLiveBody({
        action: 'remove_counted',
        names: ['Gloria'],
        count: 1,
        actorName: 'Daniel Harder',
      }),
    ).toBe('Daniel Harder removed a counted day for Gloria.');
  });

  it('plans the same N and names people who cannot take it', () => {
    const courtney = {
      userId: 'c',
      displayName: 'Courtney',
      openMisses: 3,
      missed: [],
      counted: [],
    };
    const silas = {
      userId: 's',
      displayName: 'Silas',
      openMisses: 3,
      missed: [],
      counted: [],
    };
    const gloria = {
      userId: 'g',
      displayName: 'Gloria',
      openMisses: 0,
      missed: [],
      counted: [],
    };
    const plan = planHostAdjustBulk({
      action: 'excuse_miss',
      people: [courtney, silas, gloria],
      count: 3,
    });
    expect(plan.apply.map((row) => row.displayName)).toEqual(['Courtney', 'Silas']);
    expect(plan.skip).toEqual([{ userId: 'g', displayName: 'Gloria', have: 0 }]);
    expect(hostAdjustSkipLines('excuse_miss', plan.skip)).toEqual([
      'Gloria has no open misses — they’ll be skipped.',
    ]);
    expect(hostAdjustConfirmLine('excuse_miss', 3, ['Courtney', 'Silas'])).toBe(
      'Excuse 3 misses for Courtney and Silas?',
    );
    expect(formatHostAdjustPeople(['Courtney', 'Silas', 'Gloria'])).toBe(
      'Courtney, Silas, and Gloria',
    );
    expect(hostAdjustActorName({ display_name: 'Daniel Harder', username: 'daniel' })).toBe(
      'Daniel Harder',
    );
  });

  it('does not write system_kind host_counted_day', () => {
    const row = hostAdjustLivePostRow({
      authorId: 'host',
      challengeId: 'c1',
      content: 'Host counted Day 3 for Silas.',
      mediaUrls: ['https://cdn.test/note.jpg'],
    });
    expect(row.hidden_from_home).toBe(true);
    expect(row.source).toBe('challenge');
    expect(row.type).toBe('feed');
    expect(row).not.toHaveProperty('system_kind');
    expect(row).not.toHaveProperty('system_key');
    expect(JSON.stringify(row)).not.toContain('host_counted_day');
  });
});
