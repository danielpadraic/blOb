import { describe, expect, it } from 'vitest';

import { authorLabel, logMissingPublishAuthor, resolveLiveAuthor, safeUserId, sessionAuthor } from '@/lib/safeIds';

describe('safeUserId', () => {
  it('does not throw when the user is missing', () => {
    expect(safeUserId(undefined, null, { id: undefined }, '  ')).toBeNull();
    expect(safeUserId(undefined, { id: 'a' }, 'b')).toBe('a');
  });
});

describe('authorLabel', () => {
  it('renders Someone when the author row is missing', () => {
    expect(authorLabel(undefined)).toBe('Someone');
    expect(authorLabel({ username: 'ada' })).toBe('ada');
  });
});

describe('resolveLiveAuthor', () => {
  it('keeps the bubble when author is missing and uses author_id', () => {
    const view = resolveLiveAuthor({ id: 'p1', author: undefined, author_id: 'u-1' });
    expect(view.authorId).toBe('u-1');
    expect(view.name).toBe('Someone');
  });

  it('prefers author.id then author_id', () => {
    expect(
      resolveLiveAuthor({
        id: 'p2',
        author: { id: 'from-author', display_name: 'Ada' },
        author_id: 'from-col',
      }).authorId,
    ).toBe('from-author');
  });
});

describe('sessionAuthor', () => {
  it('builds a minimal author from the session profile', () => {
    expect(sessionAuthor({ username: 'ada', display_name: 'Ada' }, 'u-1')).toEqual({
      id: 'u-1',
      username: 'ada',
      display_name: 'Ada',
      avatar_url: null,
    });
    expect(sessionAuthor(undefined, null)).toBeNull();
  });
});

describe('logMissingPublishAuthor', () => {
  it('logs once when author is missing and never when present', () => {
    const logged: unknown[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logged.push(args);
    };
    try {
      logMissingPublishAuthor({ type: 'wave', postId: 'p-log-1', hasAuthor: true });
      logMissingPublishAuthor({ type: 'wave', postId: 'p-log-1', hasAuthor: false });
      logMissingPublishAuthor({ type: 'wave', postId: 'p-log-1', hasAuthor: false });
      logMissingPublishAuthor({ type: 'feed', postId: '', hasAuthor: false });
    } finally {
      console.log = original;
    }
    expect(logged).toEqual([['[blob:publish]', { type: 'wave', postId: 'p-log-1', hasAuthor: false }]]);
  });
});
