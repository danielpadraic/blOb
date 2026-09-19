import { describe, expect, it } from 'vitest';

import { authorLabel, liveAuthorNeedsHydrate, logMissingPublishAuthor, resolveLiveAuthor, safeUserId, seedLiveAuthor, sessionAuthor } from '@/lib/safeIds';

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

  it('seeds Someone when the join is missing, never Member', () => {
    const seeded = seedLiveAuthor({ id: 'p9', author: undefined, author_id: 'u-9' });
    expect(seeded.author?.id).toBe('u-9');
    expect(seeded.author?.display_name).toBe('Someone');
    expect(seedLiveAuthor({ id: 'p10', author: undefined }).author?.id).toBe('someone:p10');
    expect(seedLiveAuthor({ id: 'p10', author: undefined }).author?.display_name).toBe('Someone');
  });

  it('uses the session profile when author_id is the viewer', () => {
    const seeded = seedLiveAuthor(
      { id: 'p11', author: undefined, author_id: 'u-host' },
      { viewerId: 'u-host', viewer: { display_name: 'Daniel Harder', username: 'daniel', avatar_url: 'https://cdn/d.jpg' } },
    );
    expect(seeded.author).toEqual({
      id: 'u-host',
      username: 'daniel',
      display_name: 'Daniel Harder',
      avatar_url: 'https://cdn/d.jpg',
    });
  });

  it('replaces a Member stub when the viewer is the author', () => {
    const seeded = seedLiveAuthor(
      { id: 'p12', author_id: 'u-host', author: { id: 'u-host', display_name: 'Member' } },
      { viewerId: 'u-host', viewer: { display_name: 'Daniel Harder', username: 'daniel' } },
    );
    expect(seeded.author?.display_name).toBe('Daniel Harder');
  });

  it('flags Member / Someone stubs for a profiles join', () => {
    expect(liveAuthorNeedsHydrate(undefined, 'u-9')).toBe(true);
    expect(liveAuthorNeedsHydrate({ id: 'u-9', display_name: 'Member' }, 'u-9')).toBe(true);
    expect(liveAuthorNeedsHydrate({ id: 'u-9', display_name: 'Someone', username: 'blob' }, 'u-9')).toBe(
      true,
    );
    expect(liveAuthorNeedsHydrate({ id: 'u-9', display_name: 'Daniel Harder', username: 'daniel' }, 'u-9')).toBe(
      false,
    );
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
