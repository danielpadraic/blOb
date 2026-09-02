import { describe, expect, it } from 'vitest';

import {
  asCirclePageTab,
  challengeIdFromPost,
  circleCorporateBlockCopy,
  circleHrefFromPost,
  circleIdFromPost,
  circleNotificationPath,
  circleInvitePushCopy,
  circleJoinedNotifyCopy,
  circlePinCapCopy,
  circleShareNotifyCopy,
  clipAfterName,
  isCircleChallengeShare,
  lastHostLeaveCopy,
  postHasCircleOrigin,
  sharesAcceptedFriend,
  viewerCanSeeHomeCirclePost,
} from '@/lib/circles';

describe('circle origin', () => {
  it('uses this row’s circle_id only', () => {
    const post = { circle_id: 'circ-1', challenge_id: null };
    expect(circleIdFromPost(post)).toBe('circ-1');
    expect(challengeIdFromPost(post)).toBeNull();
    expect(postHasCircleOrigin(post)).toBe(true);
    expect(String(circleHrefFromPost(post))).toContain('/circles/circ-1');
  });

  it('never paints a last-open challenge onto a Circle link', () => {
    const lastOpenChallenge = 'workout-group-2';
    const post = { circle_id: 'circ-9', challenge_id: null };
    expect(circleIdFromPost(post)).not.toBe(lastOpenChallenge);
    expect(String(circleHrefFromPost(post))).not.toContain(lastOpenChallenge);
  });

  it('does not treat a challenge row as a circle origin', () => {
    expect(postHasCircleOrigin({ circle_id: null, challenge_id: 'ch-1' })).toBe(false);
    expect(postHasCircleOrigin({ circle_id: 'c1', challenge_id: 'ch-1' })).toBe(false);
  });

  it('shows Circle body posts to members who are not friends with the author', () => {
    expect(
      viewerCanSeeHomeCirclePost({
        circleId: 'circ-1',
        type: 'feed',
        visibility: 'friends',
        authorId: 'a',
        viewerId: 'b',
        viewerIsMember: true,
        friendsWithAuthor: false,
      }),
    ).toBe(true);
    expect(
      viewerCanSeeHomeCirclePost({
        circleId: 'circ-1',
        type: 'feed',
        visibility: 'friends',
        authorId: 'a',
        viewerId: 'b',
        viewerIsMember: false,
        friendsWithAuthor: true,
      }),
    ).toBe(false);
  });

  it('does not show FoF Circle posts to a stranger', () => {
    expect(
      viewerCanSeeHomeCirclePost({
        circleId: 'circ-1',
        type: 'feed',
        visibility: 'friends_of_friends',
        authorId: 'a',
        viewerId: 'z',
        viewerIsMember: false,
        friendsWithAuthor: false,
        friendsOfFriendsWithAuthor: false,
      }),
    ).toBe(false);
    expect(
      viewerCanSeeHomeCirclePost({
        circleId: 'circ-1',
        type: 'feed',
        visibility: 'friends_of_friends',
        authorId: 'a',
        viewerId: 'z',
        viewerIsMember: false,
        friendsWithAuthor: false,
        friendsOfFriendsWithAuthor: true,
      }),
    ).toBe(true);
    expect(
      sharesAcceptedFriend({
        viewerId: 'z',
        authorId: 'a',
        viewerFriendIds: ['pal'],
        authorFriendIds: ['other'],
      }),
    ).toBe(false);
    expect(
      sharesAcceptedFriend({
        viewerId: 'z',
        authorId: 'a',
        viewerFriendIds: ['pal'],
        authorFriendIds: ['pal'],
      }),
    ).toBe(true);
  });

  it('lets a non-member see a Public Circle Home card', () => {
    expect(
      viewerCanSeeHomeCirclePost({
        circleId: 'circ-1',
        type: 'feed',
        visibility: 'public',
        authorId: 'a',
        viewerId: 'z',
        viewerIsMember: false,
        friendsWithAuthor: false,
      }),
    ).toBe(true);
  });

  it('keeps invite cards friends-only and honors hide-from-Home', () => {
    expect(
      viewerCanSeeHomeCirclePost({
        circleId: 'circ-1',
        type: 'circle_invite',
        authorId: 'a',
        viewerId: 'b',
        viewerIsMember: false,
        friendsWithAuthor: true,
      }),
    ).toBe(true);
    expect(
      viewerCanSeeHomeCirclePost({
        circleId: 'circ-1',
        type: 'feed',
        hiddenFromHome: true,
        authorId: 'a',
        viewerId: 'a',
        viewerIsMember: true,
        friendsWithAuthor: true,
      }),
    ).toBe(false);
  });
});

describe('circle invite copy', () => {
  it('keeps the line after the name at or under 100 characters', () => {
    const long = 'A'.repeat(200);
    const line = circleInvitePushCopy('Sam', long, 'gentle');
    expect(line.startsWith('Sam')).toBe(true);
    expect(line.slice('Sam'.length).length).toBeLessThanOrEqual(100);
  });

  it('names the joiner and the Circle', () => {
    expect(circleJoinedNotifyCopy('Sam', 'Dawn Patrol')).toBe('Sam joined Dawn Patrol.');
  });

  it('maps old Feed links to Chat and keeps non-members on Details', () => {
    expect(asCirclePageTab('feed', true)).toBe('chat');
    expect(asCirclePageTab('chat', true)).toBe('chat');
    expect(asCirclePageTab('chat', false)).toBe('details');
    expect(asCirclePageTab('feed', false)).toBe('details');
    expect(asCirclePageTab('roster', false)).toBe('roster');
    expect(asCirclePageTab(undefined, true)).toBe('details');
  });

  it('routes invite to Details and a post to Chat', () => {
    expect(circleNotificationPath('circle_invite', 'circ-1')).toBe('/circles/circ-1?tab=details');
    expect(circleNotificationPath('circle_post', 'circ-1', 'p9')).toBe(
      '/circles/circ-1?tab=chat&postId=p9',
    );
    expect(circleNotificationPath('circle_challenge_share', 'circ-1', 'p2')).toBe(
      '/circles/circ-1?tab=chat&postId=p2',
    );
  });

  it('names the sharer, challenge, and Circle and clips the tail', () => {
    expect(circleShareNotifyCopy('Sam', 'Workout Group #2', 'Dawn Patrol')).toBe(
      'Sam shared Workout Group #2 in Dawn Patrol.',
    );
    const long = circleShareNotifyCopy('Sam', 'W'.repeat(200), 'Circle');
    expect(long.startsWith('Sam')).toBe(true);
    expect(long.slice('Sam'.length).length).toBeLessThanOrEqual(100);
  });

  it('blocks corporate share and a sixth pin with the product copy', () => {
    expect(circleCorporateBlockCopy()).toBe('Keep this in the company challenge.');
    expect(circlePinCapCopy()).toBe('You can pin up to 5.');
  });

  it('treats a share card as the share type and still fans out on Home to members', () => {
    expect(isCircleChallengeShare({ type: 'circle_challenge_share' })).toBe(true);
    expect(
      viewerCanSeeHomeCirclePost({
        circleId: 'circ-1',
        type: 'circle_challenge_share',
        visibility: 'friends',
        authorId: 'a',
        viewerId: 'stranger',
        viewerIsMember: false,
        friendsWithAuthor: false,
      }),
    ).toBe(false);
    expect(
      viewerCanSeeHomeCirclePost({
        circleId: 'circ-1',
        type: 'circle_challenge_share',
        visibility: 'friends',
        authorId: 'a',
        viewerId: 'member',
        viewerIsMember: true,
        friendsWithAuthor: false,
      }),
    ).toBe(true);
  });

  it('blocks last-host leave with copy', () => {
    expect(lastHostLeaveCopy()).toMatch(/only host/i);
  });

  it('clips a long tail without dropping the name', () => {
    expect(clipAfterName('Sam', ` ${'x'.repeat(120)}`).startsWith('Sam')).toBe(true);
    expect(clipAfterName('Sam', ` ${'x'.repeat(120)}`).length).toBeLessThanOrEqual(3 + 100);
  });
});
