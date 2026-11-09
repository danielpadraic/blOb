import { describe, expect, it } from 'vitest';

import { officialNoticeRoomId } from '@/lib/checkin/officialNoticeRoom';

const rooms = [
  { id: 'week', official_kind: 'coin_weekly' },
  { id: 'month', official_kind: 'coin_monthly' },
  { id: 'friends', official_kind: null },
];

describe('officialNoticeRoomId', () => {
  it('sends a monthly notice to the weekly host', () => {
    expect(officialNoticeRoomId('month', rooms)).toBe('week');
  });

  it('keeps the weekly host and ordinary challenges as they are', () => {
    expect(officialNoticeRoomId('week', rooms)).toBe('week');
    expect(officialNoticeRoomId('friends', rooms)).toBe('friends');
  });

  it('never falls back to the monthly sibling when the host is missing', () => {
    expect(officialNoticeRoomId('month', [{ id: 'month', official_kind: 'coin_monthly' }])).toBeNull();
  });

  it('ignores a blank id', () => {
    expect(officialNoticeRoomId('', rooms)).toBeNull();
  });
});
