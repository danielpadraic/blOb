import { describe, expect, it, vi } from 'vitest';

import {
  applyLiveBackGesture,
  applyLiveReaction,
  buildLiveThreadRows,
  findLiveHighlightIndex,
  formatLiveClock,
  isLiveSystemPost,
  liveChatText,
  liveCheckinHeadline,
  liveCheckinLabel,
  liveComposeFromInline,
  liveEditMediaUrls,
  liveEditPrefill,
  liveProofCaption,
  liveQuoteLine,
  liveQuotePreview,
  liveReactionCounts,
  liveScreenBackGesture,
  liveSwipeClaimsReply,
  seedLiveFeedPosts,
  liveRowKey,
  liveErrorFile,
  canComposeInLive,
  liveEmptyBody,
  sortLivePosts,
  toggleLiveReactionList,
} from '@/lib/liveThread';

describe('sortLivePosts', () => {
  it('keeps one row per posts.id', () => {
    const rows = sortLivePosts([
      { id: 'same', created_at: '2026-09-10T17:21:00.000Z', content: 'hello' },
      { id: 'same', created_at: '2026-09-10T17:21:00.000Z', content: 'hello' },
      { id: 'same', created_at: '2026-09-10T17:21:00.000Z', content: 'hello' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('same');
  });

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

describe('seedLiveFeedPosts / liveRowKey', () => {
  it('fills a Member author and does not throw on missing id in the key helper', () => {
    const rows = seedLiveFeedPosts([
      { id: 'p1', author_id: 'u-1', content: 'hi', media_urls: null, comments: [null] },
      { id: '', content: 'drop me' },
      null,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].author?.id).toBe('u-1');
    expect(rows[0].author?.display_name).toBe('Member');
    expect(rows[0].media_urls).toEqual([]);
    expect(liveRowKey({ id: undefined, kind: 'post' }, 3)).toBe('live:post:');
    expect(liveRowKey(null, 0)).toBe('live:row:');
    expect(
      liveRowKey(
        {
          id: 'post-new',
          kind: 'post',
          post: { checkin_id: '11111111-1111-4111-8111-111111111111' },
        },
        0,
      ),
    ).toBe('checkin:11111111-1111-4111-8111-111111111111');
  });

  it('reads the throwing file from a stack for Retry logs', () => {
    const err = new Error("Can't find variable useAuth");
    err.stack = `ReferenceError: Can't find variable useAuth\n    at usePeriodCheckin (hooks/useChallengeCheckin.ts:312:20)`;
    expect(liveErrorFile(err)).toBe('hooks/useChallengeCheckin.ts');
  });
});

describe('formatLiveClock', () => {
  it('prints a simple clock like 9:44', () => {
    expect(formatLiveClock('2026-09-01T15:44:00.000Z')).toMatch(/^\d{1,2}:\d{2}$/);
    expect(formatLiveClock('not-a-date')).toBe('');
  });
});

describe('liveCheckinHeadline', () => {
  it('never shows an invented activity sentence', () => {
    expect(
      liveCheckinHeadline({
        source: 'checkin',
        checkin_stage: 'started',
        content: 'Daniel is working out!',
      }),
    ).toBe('Check-in');
    expect(
      liveCheckinHeadline({
        source: 'checkin',
        checkin_stage: 'started',
        content: 'Daniel Harder was exercising for 30-minutes.',
      }),
    ).toBe('Check-in');
  });

  it('reads Check-in Complete once every required slot is in', () => {
    expect(
      liveCheckinHeadline({
        source: 'checkin',
        checkin_stage: 'complete',
        content: 'legs day',
      }),
    ).toBe('Check-in Complete');
  });

  it('keeps the stage chip when the caption is the athlete’s own words', () => {
    expect(
      liveCheckinHeadline({ source: 'checkin', checkin_stage: 'started', content: 'leg day' }),
    ).toBe('Check-in');
    expect(liveCheckinHeadline({ source: 'checkin', checkin_stage: 'started' })).toBe('Check-in');
  });

  it('does not treat health lines as the Live headline', () => {
    expect(
      liveCheckinHeadline({
        source: 'checkin',
        checkin_stage: 'started',
        content: 'Check-in Complete\nApple Watch · 42 min · 138 bpm',
      }),
    ).toBe('Check-in');
  });
});

describe('liveProofCaption', () => {
  it('prefers that slot’s caption over the receipt line', () => {
    const post = {
      media_urls: ['https://x/pre.jpg', 'https://x/post.jpg'],
      media_captions: ['Warm up', null],
    };
    expect(liveProofCaption(post, 'https://x/pre.jpg', 'Check-in Complete')).toBe('Warm up');
    expect(liveProofCaption(post, 'https://x/post.jpg', 'Check-in Complete')).toBe(
      'Check-in Complete',
    );
    expect(liveProofCaption(post, 'https://x/other.jpg', 'Check-in Complete')).toBe(
      'Check-in Complete',
    );
  });
});

describe('liveSwipeClaimsReply', () => {
  it('needs a clear rightward drag so vertical scroll still wins', () => {
    expect(liveSwipeClaimsReply(30, 4)).toBe(true);
    expect(liveSwipeClaimsReply(6, 0)).toBe(false);
    expect(liveSwipeClaimsReply(-40, 2)).toBe(false);
    expect(liveSwipeClaimsReply(20, 40)).toBe(false);
  });
});

describe('liveScreenBackGesture', () => {
  it('turns off stack pop on Live and leaves Overview/Board with a back swipe', () => {
    expect(liveScreenBackGesture(true)).toEqual({
      gestureEnabled: false,
      fullScreenGestureEnabled: false,
    });
    expect(liveScreenBackGesture(false)).toEqual({
      gestureEnabled: true,
      fullScreenGestureEnabled: false,
    });
  });

  it('locks the Live screen and the Lobby [id] screen, not the tab bar', () => {
    const tabs = {
      setOptions: vi.fn(),
      getState: () => ({
        routeNames: ['feed', 'challenges'],
        routes: [{ name: 'feed' }, { name: 'challenges' }],
      }),
    };
    const challenges = {
      setOptions: vi.fn(),
      getState: () => ({
        routeNames: ['index', 'create', 'callout/create', '[id]'],
        routes: [{ name: 'index' }, { name: '[id]' }],
      }),
      getParent: () => tabs,
    };
    const live = {
      setOptions: vi.fn(),
      getParent: () => challenges,
    };
    applyLiveBackGesture(live, true);
    expect(live.setOptions).toHaveBeenCalledWith({
      gestureEnabled: false,
      fullScreenGestureEnabled: false,
    });
    expect(challenges.setOptions).toHaveBeenCalledWith({
      gestureEnabled: false,
      fullScreenGestureEnabled: false,
    });
    expect(tabs.setOptions).not.toHaveBeenCalled();
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
  it('does not treat Starting or Done as special compose input', () => {
    expect(liveComposeFromInline('Starting').text).toBe('Starting');
    expect(liveComposeFromInline('Done').text).toBe('Done');
  });

  it('keeps the line and pulls media URLs out for the lobby post', () => {
    const split = liveComposeFromInline(
      'Almost there\nhttps://cdn.example.com/object/public/post-media/u/1.jpg',
    );
    expect(split.text).toBe('Almost there');
    expect(split.mediaUrls).toEqual(['https://cdn.example.com/object/public/post-media/u/1.jpg']);
  });
});

describe('liveQuotePreview', () => {
  it('uses the check-in label or the chat line', () => {
    expect(liveQuotePreview({ source: 'checkin', checkin_stage: 'complete', content: 'x' })).toBe(
      'Check-in Complete',
    );
    expect(liveChatText('Good job!\nhttps://cdn.example.com/a.jpg', ['https://cdn.example.com/a.jpg'])).toBe(
      'Good job!',
    );
    expect(liveQuotePreview({ content: 'Good job!', media_urls: [] })).toBe('Good job!');
  });
});

describe('liveQuoteLine', () => {
  it('joins name and snippet on one line', () => {
    expect(liveQuoteLine('Courtney', 'Check-in Complete')).toBe('Courtney');
    expect(liveQuoteLine('Courtney', 'Check-in')).toBe('Courtney');
    expect(liveQuoteLine('Courtney', 'starting now')).toBe('Courtney · starting now');
    expect(liveQuoteLine('Courtney', '')).toBe('Courtney');
    expect(liveQuoteLine('', 'Photo')).toBe('Photo');
  });
});

describe('toggleLiveReactionList', () => {
  it('stacks types and clears only the tapped type', () => {
    const afterFire = toggleLiveReactionList([], 'u1', 'fire', 'p1', null);
    const afterLike = toggleLiveReactionList(afterFire, 'u1', 'like', 'p1', null);
    expect(afterLike.map((row) => row.reaction_type)).toEqual(['fire', 'like']);
    expect(toggleLiveReactionList(afterLike, 'u1', 'like', 'p1', null).map((row) => row.reaction_type)).toEqual([
      'fire',
    ]);
  });
});

describe('liveReactionCounts', () => {
  it('counts each type and marks mine without collapsing to heart', () => {
    const counts = liveReactionCounts(
      [
        { id: '1', user_id: 'me', post_id: 'p', reaction_type: 'fire', created_at: '2026-09-01T12:00:00.000Z' },
        { id: '2', user_id: 'me', post_id: 'p', reaction_type: 'like', created_at: '2026-09-01T12:00:01.000Z' },
        { id: '3', user_id: 'you', post_id: 'p', reaction_type: 'fire', created_at: '2026-09-01T12:00:02.000Z' },
      ],
      'me',
    );
    expect(counts).toEqual([
      { type: 'like', count: 1, mine: true },
      { type: 'fire', count: 2, mine: true },
    ]);
  });
});

describe('buildLiveThreadRows', () => {
  it('keeps a check-in receipt and emits its comments so a comment alert can land', () => {
    const rows = buildLiveThreadRows([
      {
        id: 'checkin-1',
        author_id: 'a',
        challenge_id: 'c',
        content: 'Checked in today',
        media_urls: ['https://cdn.example.com/proof.jpg'],
        created_at: '2026-09-01T12:00:00.000Z',
        source: 'checkin',
        checkin_stage: 'complete',
        comments: [
          {
            id: 'n1',
            post_id: 'checkin-1',
            author_id: 'b',
            content: 'Why is there two of the same photo',
            created_at: '2026-09-01T12:01:00.000Z',
          },
        ],
      },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['checkin-1', 'comment:n1']);
    expect(rows[1]?.kind).toBe('comment');
    expect(findLiveHighlightIndex(rows, 'checkin-1', 'n1')).toBe(1);
  });

  it('keeps existing comments as later chat rows, not a nested card', () => {
    const rows = buildLiveThreadRows([
      {
        id: 'p1',
        author_id: 'a',
        challenge_id: 'c',
        content: 'Started',
        media_urls: [],
        created_at: '2026-09-01T12:00:00.000Z',
        comments: [
          {
            id: 'n1',
            post_id: 'p1',
            author_id: 'b',
            content: 'Good job!',
            created_at: '2026-09-01T12:01:00.000Z',
          },
        ],
      },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['p1', 'comment:n1']);
    expect(rows[1]?.kind).toBe('comment');
  });

  it('keeps a deleted parent comment so its reply stays in the lobby', () => {
    const rows = buildLiveThreadRows([
      {
        id: 'p1',
        author_id: 'a',
        challenge_id: 'c',
        content: 'Started',
        media_urls: [],
        created_at: '2026-09-01T12:00:00.000Z',
        comments: [
          {
            id: 'n1',
            post_id: 'p1',
            author_id: 'me',
            content: 'Hi',
            created_at: '2026-09-01T12:01:00.000Z',
            deleted_at: '2026-09-01T12:03:00.000Z',
          },
          {
            id: 'n2',
            post_id: 'p1',
            author_id: 'you',
            parent_id: 'n1',
            content: 'Hey',
            created_at: '2026-09-01T12:02:00.000Z',
          },
        ],
      },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['p1', 'comment:n1', 'comment:n2']);
  });

  it('scrolls to the reply row by comments.id, not only the parent post', () => {
    const rows = buildLiveThreadRows([
      {
        id: 'p1',
        author_id: 'a',
        challenge_id: 'c',
        content: 'Started',
        media_urls: [],
        created_at: '2026-09-01T12:00:00.000Z',
        comments: [
          {
            id: 'n1',
            post_id: 'p1',
            author_id: 'b',
            content: 'Hi',
            created_at: '2026-09-01T12:01:00.000Z',
          },
          {
            id: 'n2',
            post_id: 'p1',
            author_id: 'c',
            parent_id: 'n1',
            content: 'Reply',
            created_at: '2026-09-01T12:02:00.000Z',
          },
        ],
      },
    ]);
    expect(findLiveHighlightIndex(rows, 'p1', 'n2')).toBe(2);
    expect(rows[2]?.id).toBe('comment:n2');
    expect(isLiveSystemPost({ type: 'circle_join' })).toBe(true);
    expect(isLiveSystemPost({ type: 'feed' })).toBe(false);
  });
});

describe('applyLiveReaction', () => {
  it('toggles a type on the post without replacing another type', () => {
    const post = applyLiveReaction(
      {
        id: 'p1',
        author_id: 'a',
        challenge_id: 'c',
        content: 'Hi',
        media_urls: [],
        created_at: '2026-09-01T12:00:00.000Z',
        reactions: [
          { id: 'r1', user_id: 'me', post_id: 'p1', reaction_type: 'fire', created_at: '2026-09-01T12:00:00.000Z' },
        ],
      },
      'me',
      'like',
    );
    expect(post.reactions?.map((row) => row.reaction_type)).toEqual(['fire', 'like']);
  });
});

describe('liveEditPrefill', () => {
  it('keeps a lobby caption and a check-in caption as stored', () => {
    expect(liveEditPrefill({ content: 'Does the reply work?', media_urls: [] })).toBe(
      'Does the reply work?',
    );
    expect(
      liveEditPrefill({
        content: 'Feeling strong',
        media_urls: ['https://cdn.example/proof.jpg'],
        source: 'checkin',
      }),
    ).toBe('Feeling strong');
    expect(
      liveEditPrefill({
        content: 'Check-in Complete',
        media_urls: ['https://cdn.example/proof.jpg'],
        source: 'checkin',
      }),
    ).toBe('');
    expect(
      liveEditPrefill({
        content: 'Check In Complete',
        media_urls: ['https://cdn.example/proof.jpg'],
        source: 'checkin',
      }),
    ).toBe('');
  });
});

describe('liveEditMediaUrls', () => {
  it('appends new lobby media and never drops the last check-in proof', () => {
    expect(liveEditMediaUrls({ media_urls: ['https://cdn.example/a.jpg'] }, ['https://cdn.example/b.jpg'])).toEqual([
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.jpg',
    ]);
    expect(
      liveEditMediaUrls({ media_urls: ['https://cdn.example/proof.jpg'], source: 'checkin' }, []),
    ).toEqual(['https://cdn.example/proof.jpg']);
    expect(liveEditMediaUrls({ media_urls: [], source: 'checkin' }, [])).toEqual([]);
  });
});

describe('canComposeInLive', () => {
  it('lets the host post with zero joiners', () => {
    expect(canComposeInLive({ isHost: true, isJoined: false, isCalloutObserver: false })).toBe(true);
    expect(canComposeInLive({ isHost: false, isJoined: true, isCalloutObserver: false })).toBe(true);
    expect(canComposeInLive({ isHost: false, isJoined: false, isCalloutObserver: true })).toBe(true);
    expect(canComposeInLive({ isHost: false, isJoined: false, isCalloutObserver: false })).toBe(false);
  });
});

describe('liveEmptyBody', () => {
  const lines = {
    watchingLine: 'Watching',
    quietBody: 'This room is quiet. Say how the work went.',
    joinToPost: 'Join the challenge to post in Live.',
    outWatchLive: 'You’re out of the prize.',
  };

  it('keeps Quiet copy for a host with an empty room', () => {
    expect(
      liveEmptyBody({
        ...lines,
        canCompose: true,
        isHost: true,
        isJoined: false,
        isCalloutObserver: false,
        viewerOut: false,
      }),
    ).toBe(lines.quietBody);
  });

  it('says Join only for a visitor who is not in the room', () => {
    expect(
      liveEmptyBody({
        ...lines,
        canCompose: false,
        isHost: false,
        isJoined: false,
        isCalloutObserver: false,
        viewerOut: false,
      }),
    ).toBe(lines.joinToPost);
  });

  it('keeps watching copy for a callout observer who is not hosting or joined', () => {
    expect(
      liveEmptyBody({
        ...lines,
        canCompose: true,
        isHost: false,
        isJoined: false,
        isCalloutObserver: true,
        viewerOut: false,
      }),
    ).toBe(lines.watchingLine);
  });
});
