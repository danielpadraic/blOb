import { describe, expect, it } from 'vitest';

import {
  formatLiveClock,
  liveCheckinLabel,
  liveComposeFromInline,
  sortLivePosts,
} from '@/lib/liveThread';

describe('sortLivePosts', () => {
  it('puts newest at the end and drops deleted rows', () => {
    const rows = sortLivePosts([
      { id: 'c', created_at: '2026-09-01T16:00:00.000Z' },
      { id: 'a', created_at: '2026-09-01T14:00:00.000Z' },
      { id: 'gone', created_at: '2026-09-01T15:00:00.000Z', deleted_at: '2026-09-01T15:01:00.000Z' },
      { id: 'b', created_at: '2026-09-01T15:00:00.000Z' },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('formatLiveClock', () => {
  it('prints a simple clock like 9:44', () => {
    expect(formatLiveClock('2026-09-01T15:44:00.000Z')).toMatch(/^\d{1,2}:\d{2}$/);
    expect(formatLiveClock('not-a-date')).toBe('');
  });
});

describe('liveCheckinLabel', () => {
  it('uses Check-in Complete only after submit', () => {
    expect(liveCheckinLabel({ source: 'checkin', checkin_stage: 'started' })).toBe('Check-in');
    expect(liveCheckinLabel({ source: 'checkin', checkin_stage: 'complete' })).toBe(
      'Check-in Complete',
    );
    expect(liveCheckinLabel({ source: 'checkin', checkin_stage: 'submitted' })).toBe(
      'Check-in Complete',
    );
  });
});

describe('liveComposeFromInline', () => {
  it('keeps the line and pulls media URLs out for the lobby post', () => {
    const split = liveComposeFromInline(
      'Almost there\nhttps://cdn.example.com/object/public/post-media/u/1.jpg',
    );
    expect(split.text).toBe('Almost there');
    expect(split.mediaUrls).toEqual(['https://cdn.example.com/object/public/post-media/u/1.jpg']);
  });
});
