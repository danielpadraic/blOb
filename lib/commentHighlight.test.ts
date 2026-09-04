import { describe, expect, it } from 'vitest';

import {
  commentScrollDelta,
  commentTargetMissing,
  commentsHaveResolved,
  findCommentById,
  liveCommentRowId,
} from '@/lib/commentHighlight';

describe('comment highlight helpers', () => {
  it('finds the reply by comments.id, not only the parent', () => {
    const rows = [
      { id: 'parent', content: 'Hi' },
      { id: 'reply', parent_id: 'parent', content: 'Hey' },
    ];
    expect(findCommentById(rows, 'reply')?.content).toBe('Hey');
    expect(liveCommentRowId('reply')).toBe('comment:reply');
  });

  it('waits until comments resolve before saying the line is gone', () => {
    expect(commentsHaveResolved(undefined, false)).toBe(false);
    expect(commentTargetMissing(undefined, 'c-1', false)).toBe(false);
    expect(commentTargetMissing([], 'c-1', true)).toBe(true);
    expect(
      commentTargetMissing(
        [{ id: 'c-1', deleted_at: '2026-09-04T12:00:00.000Z' }],
        'c-1',
        true,
      ),
    ).toBe(true);
    expect(commentTargetMissing([{ id: 'c-1' }], 'c-1', true)).toBe(false);
  });

  it('nudges just enough to bring a comment into the visible band', () => {
    expect(commentScrollDelta({ y: 40, height: 40, windowHeight: 800, topSafe: 88 })).toBe(-48);
    expect(
      commentScrollDelta({ y: 700, height: 80, windowHeight: 800, bottomSafe: 580 }),
    ).toBe(200);
    expect(commentScrollDelta({ y: 200, height: 40, windowHeight: 800, topSafe: 88, bottomSafe: 580 })).toBe(
      0,
    );
  });
});
