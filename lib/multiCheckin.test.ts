import { describe, expect, it } from 'vitest';

import {
  hubRowState,
  mergeMultiCheckinRows,
  nextEmptyCheckinId,
  parseDoneIds,
  remainingProofLabelsOf,
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
    expect(multiCheckinHref(['abc-1', 'abc-2'])).toBe('/checkin?done=abc-1,abc-2');
    expect(multiCheckinHref(null)).toBe('/checkin');
  });

  it('carries a failed-extra notice without dropping the done ids', () => {
    expect(multiCheckinHref('abc-1', 'Your check-in still counts.')).toBe(
      '/checkin?done=abc-1&notice=Your%20check-in%20still%20counts.',
    );
    expect(multiCheckinHref('abc-1', null)).toBe('/checkin?done=abc-1');
    expect(multiCheckinHref('abc-1', '  ')).toBe('/checkin?done=abc-1');
  });
});

describe('Multi Check-In hub rows', () => {
  const thirtyDayProofs = [
    { id: 'pre', name: 'Post a pre-workout selfie.', method: 'photo' },
    { id: 'post', name: 'Post a post-workout selfie.', method: 'photo' },
    { id: 'hr', name: 'Share proof of at least 30 minutes of elevated heart rate.', method: 'hr' },
  ];

  it('does not treat done= as period complete when required slots remain', () => {
    const rows = mergeMultiCheckinRows(
      [
        {
          id: '30-day',
          title: '30-Day Consistency',
          task: 'Workout',
          format: 'consistency',
          frequency: 'daily',
          checkinPhase: 'submitted',
          remainingProofLabels: ['post-workout selfie', 'heart rate'],
          proofs: thirtyDayProofs,
        } as never,
        {
          id: 'prayer',
          title: 'Prayer',
          task: 'Pray',
          format: 'points',
          challenge_type: 'points',
          checkinPhase: 'none',
          remainingProofLabels: [],
        } as never,
      ],
      ['30-day'],
    );
    expect(rows[0]?.state).toBe('in_progress');
    expect(rows[0]?.remainingProofLabels).toEqual(['post-workout selfie', 'heart rate']);
    expect(rows[1]?.state).toBe('not_started');
    expect(nextEmptyCheckinId(rows, '30-day')).toBe('prayer');
    expect(hubRowState('submitted', true, ['post-workout selfie', 'heart rate'], true)).toBe(
      'in_progress',
    );
    expect(hubRowState('none', false, [], false)).toBe('not_started');
    expect(hubRowState('submitted', true, [], true)).toBe('complete');
    expect(parseDoneIds('hobby,gym')).toEqual(['hobby', 'gym']);
  });

  it('walks Next through In progress, not only Not started', () => {
    const rows = mergeMultiCheckinRows(
      [
        {
          id: 'done',
          title: 'Done',
          remainingProofLabels: [],
          checkinPhase: 'submitted',
          format: 'consistency',
          frequency: 'daily',
        } as never,
        {
          id: 'partial',
          title: '30-Day',
          remainingProofLabels: ['heart rate'],
          checkinPhase: 'in_progress',
          format: 'consistency',
          frequency: 'daily',
        } as never,
      ],
      ['done'],
    );
    expect(rows[1]?.state).toBe('in_progress');
    expect(nextEmptyCheckinId(rows, 'done')).toBe('partial');
  });

  it('keeps a completed row after it drops out of loggable', () => {
    const rows = mergeMultiCheckinRows([{ id: 'gym', title: 'Gym', task: 'Workout', checkinPhase: 'none' } as never], ['hobby'], {
      hobby: { title: 'Hobby', task: 'Selfie', remainingProofLabels: [] },
    });
    expect(rows.find((row) => row.id === 'hobby')).toMatchObject({ title: 'Hobby', state: 'complete' });
    expect(rows.find((row) => row.id === 'gym')?.state).toBe('not_started');
  });

  it('keeps remaining labels after a submitted first selfie', () => {
    const labels = remainingProofLabelsOf(
      {
        proofs: thirtyDayProofs,
      } as never,
      {
        pre: { method: 'photo', url: 'https://cdn.test/pre.jpg' },
      },
      'submitted',
    );
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.join(' · ').toLowerCase()).toMatch(/post-workout|heart rate|hr/);
  });

  it('merges a partial 30-Day snapshot as In progress, not Complete', () => {
    const rows = mergeMultiCheckinRows([], ['30-day'], {
      '30-day': {
        title: '30-Day Consistency',
        task: 'Workout',
        remainingProofLabels: ['post-workout selfie', 'heart rate'],
      },
    });
    expect(rows[0]).toMatchObject({
      id: '30-day',
      state: 'in_progress',
      remainingProofLabels: ['post-workout selfie', 'heart rate'],
    });
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
  it('never mashes two check-ins into one Home card', () => {
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
    expect(stacked).toHaveLength(2);
    expect(stacked.map((item) => ('id' in item ? item.id : ''))).toEqual(['p1', 'p2']);
    expect(stacked.some((item) => 'kind' in item && item.kind === 'stack')).toBe(false);
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
    expect(stacked).toHaveLength(3);
    expect(stacked.map((item) => ('kind' in item && item.kind === 'stack' ? 'stack' : item.id))).toEqual([
      'p1',
      'p-hidden',
      'p2',
    ]);
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
