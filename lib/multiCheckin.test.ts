import { describe, expect, it } from 'vitest';

import {
  hubRowState,
  mergeMultiCheckinRows,
  nextEmptyCheckinId,
  parseDoneIds,
  stackHomeCheckinPosts,
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

describe('Home check-in stack (slice 2, not wired)', () => {
  it('stacks two Home check-ins from the same author within two minutes', () => {
    const stacked = stackHomeCheckinPosts([
      {
        id: 'p1',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:00.000Z',
        author: { display_name: 'Ada' },
        challenge: { title: 'Hobby' },
      },
      {
        id: 'p2',
        author_id: 'u1',
        created_at: '2026-09-01T18:01:10.000Z',
        author: { display_name: 'Ada' },
        challenge: { title: 'Gym' },
      },
    ]);
    expect(stacked).toHaveLength(1);
    expect(stacked[0]).toMatchObject({
      kind: 'stack',
      count: 2,
      copy: 'Ada checked in to 2 challenges',
    });
  });

  it('does not stack private Home-hidden posts', () => {
    const stacked = stackHomeCheckinPosts([
      {
        id: 'p1',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:00.000Z',
        hidden_from_home: true,
        author: { display_name: 'Ada' },
      },
      {
        id: 'p2',
        author_id: 'u1',
        created_at: '2026-09-01T18:00:20.000Z',
        author: { display_name: 'Ada' },
      },
    ]);
    expect(stacked.some((item) => 'kind' in item && item.kind === 'stack')).toBe(false);
  });
});
