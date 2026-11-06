import { describe, expect, it } from 'vitest';

import { buildLiftDmBody, parseLiftDmBody, sendLiftCardToThreads } from '@/lib/lift/dmCard';
import type { LiftSessionDraft } from '@/lib/lift/types';

const draft = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Legs · Sep 30',
  titleIsAuto: false,
  performedAt: '2026-09-30T15:00:00.000Z',
  completedAt: '2026-09-30T16:00:00.000Z',
  status: 'completed',
  unit: 'lb',
  muscleKeys: ['quads'],
  exercises: [],
} as unknown as LiftSessionDraft;

describe('lift DM card', () => {
  it('round-trips a card and never uses an Open this post link', () => {
    const body = buildLiftDmBody({ draft, authorId: 'dan', caption: 'Heavy' });
    expect(body).not.toContain('Open this post');
    expect(body).not.toContain('/posts/');
    const parsed = parseLiftDmBody(body);
    expect(parsed?.sessionId).toBe(draft.id);
    expect(parsed?.caption).toBe('Heavy');
    expect(parsed?.snapshot.sessionId).toBe(draft.id);
  });

  it('writes one card into the thread, with title and no Home post', async () => {
    const sent: Array<{ conversation_id: string; body: string }> = [];
    const count = await sendLiftCardToThreads({
      draft,
      authorId: 'dan',
      caption: '',
      recipientIds: ['amy'],
      startChat: async () => ({ id: 'thread-1' }),
      startGroup: async () => ({ id: 'group-1' }),
      send: async (message) => {
        sent.push(message);
      },
    });
    expect(count).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.conversation_id).toBe('thread-1');
    expect(sent[0]?.body).toContain('Legs · Sep 30');
    expect(parseLiftDmBody(sent[0]?.body)?.snapshot.title).toBe('Legs · Sep 30');
  });

  it('says so when nothing was delivered', async () => {
    await expect(
      sendLiftCardToThreads({
        draft,
        authorId: 'dan',
        recipientIds: ['amy'],
        startChat: async () => {
          throw new Error('offline');
        },
        startGroup: async () => ({ id: 'g' }),
        send: async () => undefined,
      }),
    ).rejects.toThrow(/Could not send/);
  });
});
