import { describe, expect, it } from 'vitest';

import {
  commentHasStoredReplies,
  commentsForThread,
  isLiveComment,
  mapCommentInList,
  parseCommentEdits,
  visibleCommentCount,
} from '@/lib/commentEdit';
import type { CommentWithAuthor } from '@/lib/types';

const live: CommentWithAuthor = {
  id: 'a',
  post_id: 'p',
  author_id: 'me',
  content: 'Hi',
  created_at: '2026-09-04T12:00:00.000Z',
};

const reply: CommentWithAuthor = {
  id: 'b',
  post_id: 'p',
  author_id: 'you',
  parent_id: 'a',
  content: 'Hey',
  created_at: '2026-09-04T12:01:00.000Z',
};

describe('comment visibility', () => {
  it('drops a deleted leaf and keeps a deleted parent that still has a reply', () => {
    expect(isLiveComment(live)).toBe(true);
    expect(isLiveComment({ ...live, deleted_at: '2026-09-04T12:02:00.000Z' })).toBe(false);
    expect(visibleCommentCount([live, { ...live, id: 'gone', deleted_at: '2026-09-04T12:02:00.000Z' }])).toBe(1);
    expect(
      commentsForThread([
        { ...live, deleted_at: '2026-09-04T12:02:00.000Z' },
        reply,
      ]).map((row) => row.id),
    ).toEqual(['a', 'b']);
    expect(commentsForThread([{ ...live, deleted_at: '2026-09-04T12:02:00.000Z' }])).toEqual([]);
  });

  it('treats any stored child as a reply so the parent soft-deletes', () => {
    expect(commentHasStoredReplies([live, reply], 'a')).toBe(true);
    expect(commentHasStoredReplies([live], 'a')).toBe(false);
  });

  it('parses history oldest first, newest last', () => {
    expect(
      parseCommentEdits([
        { body: 'newish', created_at: '2026-09-04T12:02:00.000Z' },
        { body: 'first', created_at: '2026-09-04T12:00:00.000Z' },
      ]).map((row) => row.body),
    ).toEqual(['first', 'newish']);
  });

  it('patches or removes one comments.id without touching siblings', () => {
    const rows = [live, reply];
    expect(mapCommentInList(rows, 'a', (row) => ({ ...row, content: 'Hello' }))[0]?.content).toBe(
      'Hello',
    );
    expect(mapCommentInList(rows, 'b', () => null).map((row) => row.id)).toEqual(['a']);
  });
});
