import { describe, expect, it } from 'vitest';

import {
  hubRowState,
  mergeMultiCheckinRows,
  nextEmptyCheckinId,
  parseDoneIds,
  stackHomeCheckinPosts,
  type HomeCheckinPost,
} from '@/lib/multiCheckin';
import { checkinSubmitHref, MULTI_CHECKIN_HREF, multiCheckinHref } from '@/lib/routes';

describe('Multi Check-In routing', () => {
  it('keeps a single Check In on submit and never opens capture', () => {
    expect(checkinSubmitHref('abc-1')).toBe('/challenges/abc-1/submit');
    expect(String(checkinSubmitHref('abc-1'))).not.toContain('capture');
    expect(checkinSubmitHref('abc-1', { from: 'multi' })).toBe('/challenges/abc-1/submit?from=multi');
    expect(checkinSubmitHref('gym', { from: 'multi', done: ['hobby'] })).toBe(
      '/challenges/gym/submit?from=multi&done=hobby',
    );
    expect(MULTI_CHECKIN_HREF).toBe('/checkin');
    expect(multiCheckinHref('abc-1')).toBe('/checkin?done=abc-1');
  });
});

describe('Multi Check-In hub rows', () => {
  it('marks done ids complete and finds the next empty row', () => {
    const rows = mergeMultiCheckinRows(
      [
        { id: 'hobby', title: 'Hobby', task: 'Selfie', checkinPhase: 'none' } as never,
        { id: 'gym', title: 'Gym', task: 'Workout', checkinPhase: 'none' } as never,
      ],
      ['hobby'],
    );
    expect(rows[0]?.state).toBe('complete');
    expect(rows[1]?.state).toBe('empty');
    expect(nextEmptyCheckinId(rows, 'hobby')).toBe('gym');
    expect(hubRowState('in_progress')).toBe('started');
    expect(parseDoneIds('hobby,gym')).toEqual(['hobby', 'gym']);
  });

  it('keeps a completed row after it drops out of loggable', () => {
    const rows = mergeMultiCheckinRows([{ id: 'gym', title: 'Gym', task: 'Workout', checkinPhase: 'none' } as never], ['hobby'], {
      hobby: { title: 'Hobby', task: 'Selfie', remainingProofLabels: [] },
    });
    expect(rows.find((row) => row.id === 'hobby')).toMatchObject({ title: 'Hobby', state: 'complete' });
    expect(rows.find((row) => row.id === 'gym')?.state).toBe('empty');
  });
});

function checkin(partial: Partial<HomeCheckinPost> & Pick<HomeCheckinPost, 'id'>): HomeCheckinPost {
  return {
    source: 'checkin',
    author: { display_name: 'Ada' },
    ...partial,
  };
}

describe('Home check-in stack', () => {
  it('stacks two Home check-ins from the same author within two minutes', () => {
    const stacked = stackHomeCheckinPosts([
      checkin({
        id: 'p1',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:00.000Z',
        challenge_id: 'hobby',
        challenge: { title: 'Hobby' },
      }),
      checkin({
        id: 'p2',
        author_id: 'u1',
        created_at: '2026-09-01T18:01:10.000Z',
        challenge_id: 'gym',
        challenge: { title: 'Gym' },
      }),
    ]);
    expect(stacked).toHaveLength(1);
    expect(stacked[0]).toMatchObject({
      kind: 'stack',
      count: 2,
      copy: 'Ada checked in to 2 challenges',
      postIds: ['p1', 'p2'],
    });
  });

  it('leaves a single check-in as a normal card', () => {
    const stacked = stackHomeCheckinPosts([
      checkin({
        id: 'p1',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:00.000Z',
        challenge_id: 'hobby',
        challenge: { title: 'Hobby' },
      }),
    ]);
    expect(stacked).toHaveLength(1);
    expect(stacked[0]).toMatchObject({ id: 'p1' });
    expect(stacked.some((item) => 'kind' in item && item.kind === 'stack')).toBe(false);
  });

  it('does not stack ordinary feed posts or Waves', () => {
    const stacked = stackHomeCheckinPosts([
      {
        id: 'thought',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:00.000Z',
        author: { display_name: 'Ada' },
      },
      {
        id: 'wave',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:20.000Z',
        type: 'wave_share',
        author: { display_name: 'Ada' },
      },
      checkin({
        id: 'p1',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:30.000Z',
        challenge_id: 'hobby',
        challenge: { title: 'Hobby' },
      }),
    ]);
    expect(stacked.map((item) => ('kind' in item && item.kind === 'stack' ? 'stack' : item.id))).toEqual([
      'thought',
      'wave',
      'p1',
    ]);
  });

  it('hides one Home-hidden child from the stack and keeps the rest', () => {
    const stacked = stackHomeCheckinPosts([
      checkin({
        id: 'p1',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:00.000Z',
        challenge_id: 'hobby',
        challenge: { title: 'Hobby' },
      }),
      checkin({
        id: 'p-hidden',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:20.000Z',
        challenge_id: 'yoga',
        hidden_from_home: true,
        challenge: { title: 'Yoga' },
      }),
      checkin({
        id: 'p2',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:40.000Z',
        challenge_id: 'gym',
        challenge: { title: 'Gym' },
      }),
    ]);
    expect(stacked).toHaveLength(2);
    expect(stacked[0]).toMatchObject({ kind: 'stack', count: 2, postIds: ['p1', 'p2'] });
    expect(stacked[1]).toMatchObject({ id: 'p-hidden' });
  });

  it('never stacks private or corporate children', () => {
    const stacked = stackHomeCheckinPosts([
      checkin({
        id: 'p1',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:00.000Z',
        challenge_id: 'hobby',
        challenge: { title: 'Hobby' },
      }),
      checkin({
        id: 'corp',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:20.000Z',
        challenge_id: 'corp',
        challenge: { title: 'Office', privacy_mode: 'private_corporate' },
      }),
      checkin({
        id: 'priv',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:40.000Z',
        challenge_id: 'priv',
        challenge: { title: 'Friends', privacy_mode: 'private' },
      }),
    ]);
    expect(stacked.some((item) => 'kind' in item && item.kind === 'stack')).toBe(false);
    expect(stacked.map((item) => ('id' in item ? item.id : ''))).toEqual(['p1', 'corp', 'priv']);
  });
});
