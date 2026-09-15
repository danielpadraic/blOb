import { describe, expect, it } from 'vitest';

import { mergeFeedMediaIntoParts, mergePeriodCheckinRows } from '@/lib/checkin/periodMerge';

describe('mergePeriodCheckinRows', () => {
  it('keeps the oldest id and unions stills from later rows', () => {
    const merged = mergePeriodCheckinRows([
      {
        id: 'ck-old',
        created_at: '2026-09-14T12:00:00.000Z',
        period_key: '2026-09-14',
        status: 'submitted',
        submitted_at: '2026-09-14T12:01:00.000Z',
        proof_parts: { pre: { method: 'photo', url: 'https://cdn.example/pre.jpg' } },
        notes: 'Check-in Complete',
      },
      {
        id: 'ck-new',
        created_at: '2026-09-14T12:10:00.000Z',
        period_key: '2026-09-14',
        status: 'submitted',
        submitted_at: '2026-09-14T12:11:00.000Z',
        proof_parts: { post: { method: 'photo', url: 'https://cdn.example/post.jpg' } },
        notes: 'felt strong',
      },
    ]);
    expect(merged?.id).toBe('ck-old');
    expect(merged?.proof_parts).toMatchObject({
      pre: { url: 'https://cdn.example/pre.jpg' },
      post: { url: 'https://cdn.example/post.jpg' },
    });
    expect(merged?.notes).toBe('felt strong');
  });

  it('does not let a later empty slot wipe a filled one', () => {
    const merged = mergePeriodCheckinRows([
      {
        id: 'ck-old',
        created_at: '2026-09-14T12:00:00.000Z',
        proof_parts: { pre: { method: 'photo', url: 'https://cdn.example/pre.jpg' } },
      },
      {
        id: 'ck-new',
        created_at: '2026-09-14T12:10:00.000Z',
        proof_parts: { pre: { method: 'photo', url: '' } },
      },
    ]);
    expect((merged?.proof_parts as { pre?: { url?: string } })?.pre?.url).toBe('https://cdn.example/pre.jpg');
  });
});

describe('mergeFeedMediaIntoParts', () => {
  it('keeps leftover post stills as extras, not a second required slot', () => {
    const next = mergeFeedMediaIntoParts(
      { pre: { method: 'photo', url: 'https://cdn.example/pre.jpg' } },
      ['https://cdn.example/pre.jpg', 'https://cdn.example/cheer.jpg'],
    );
    expect(next.__feed?.urls).toEqual(['https://cdn.example/cheer.jpg']);
  });
});
