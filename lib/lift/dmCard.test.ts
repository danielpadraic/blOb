import { describe, expect, it } from 'vitest';

import { buildLiftDmBody, parseLiftDmBody } from '@/lib/lift/dmCard';
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
});
