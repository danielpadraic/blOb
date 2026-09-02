import { describe, expect, it } from 'vitest';

import { conversationLastMessageAt, sortConversationsNewestFirst } from '@/lib/conversationList';

describe('conversation list order', () => {
  it('puts the newest last_message_at first', () => {
    const rows = [
      { id: 'old', last_message_at: '2026-08-27T12:00:00.000Z', updated_at: '2026-08-31T12:00:00.000Z' },
      { id: 'mrs', last_message_at: '2026-09-01T20:00:00.000Z', updated_at: '2026-08-01T12:00:00.000Z' },
      { id: 'silas', last_message: { created_at: '2026-09-01T19:00:00.000Z' }, updated_at: '2026-08-01T12:00:00.000Z' },
    ];
    expect(sortConversationsNewestFirst(rows).map((row) => row.id)).toEqual(['mrs', 'silas', 'old']);
    expect(conversationLastMessageAt(rows[1])).toBe('2026-09-01T20:00:00.000Z');
  });
});
