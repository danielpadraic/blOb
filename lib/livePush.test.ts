import { describe, expect, it } from 'vitest';

import {
  liveChallengeHref,
  liveChatPushCopy,
  liveChatSnippet,
  liveMuteAllowsRecipient,
  liveNotificationHref,
  liveOrReminderPushHref,
  asChallengePageTab,
} from '@/lib/livePush';
import { namedChallengePhrase } from '@/lib/challengeNotifyName';
import { challengeDetailHref } from '@/lib/routes';

const MILES = namedChallengePhrase('Morning miles');

describe('live chat push copy', () => {
  it('titles the challenge, not Bob, and keeps the first 80 characters', () => {
    const copy = liveChatPushCopy({
      name: 'Sam',
      challengeTitle: 'Morning miles',
      text: '  hello   from the lobby  ',
    });
    expect(copy.title).toBe(`Sam in ${MILES}`);
    expect(copy.body).toBe('hello from the lobby');
    expect(liveChatSnippet('x'.repeat(90)).length).toBe(80);
  });

  it('uses Photo when the Live line is media only', () => {
    expect(liveChatPushCopy({ name: 'Sam', challengeTitle: 'Morning miles', hasMedia: true }).body).toBe(
      'Photo',
    );
  });
});

describe('live notification deep links', () => {
  it('opens Live on that post, not camera submit or Overview', () => {
    const href = String(liveChallengeHref('c1', { postId: 'p1' }));
    expect(href).toBe('/challenges/c1?tab=live&postId=p1');
    expect(href).not.toContain('/submit');
    expect(href).not.toContain('tab=overview');
  });

  it('opens a Live check-in receipt on Live, not Overview camera', () => {
    const href = String(liveChallengeHref('c1', { postId: 'p9' }));
    expect(href).toContain('tab=live');
    expect(href).toContain('postId=p9');
    expect(href).not.toContain('/submit');
  });

  it('scrolls a Live reply to the comment id', () => {
    const href = String(liveChallengeHref('c1', { postId: 'p1', commentId: 'c9' }));
    expect(href).toContain('tab=live');
    expect(href).toContain('commentId=c9');
    expect(href).not.toContain('/submit');
  });

  it('treats tab=live as the Live tab', () => {
    expect(asChallengePageTab('live')).toBe('feed');
    expect(asChallengePageTab('feed')).toBe('feed');
    expect(asChallengePageTab('overview')).toBe('overview');
    expect(asChallengePageTab('board')).toBe('board');
    expect(asChallengePageTab('nope')).toBe('overview');
  });

  it('rebuilds Live hrefs from payload url and challengeId', () => {
    expect(
      String(
        liveNotificationHref({
          type: 'live_message',
          challengeId: 'c1',
          postId: 'p2',
          url: '/challenges/c1?tab=live',
        }),
      ),
    ).toBe('/challenges/c1?tab=live&postId=p2');
    expect(
      String(
        liveNotificationHref({
          type: 'live_reply',
          url: '/challenges/abc?tab=feed&postId=old',
          commentId: 'c9',
        }),
      ),
    ).toBe('/challenges/abc?tab=live&postId=old&comments=1&commentId=c9');
  });
});

describe('live mute recipients', () => {
  it('All gets every Live line; Off skips; Mentions only needs @me or parent author', () => {
    expect(liveMuteAllowsRecipient('all', {})).toBe(true);
    expect(liveMuteAllowsRecipient('off', { mentioned: true, parentAuthor: true })).toBe(false);
    expect(liveMuteAllowsRecipient('mentions', { mentioned: true })).toBe(true);
    expect(liveMuteAllowsRecipient('mentions', { parentAuthor: true })).toBe(true);
    expect(liveMuteAllowsRecipient('mentions', {})).toBe(false);
  });
});

describe('push tap routing', () => {
  it('Live chat tap opens that Live thread, not Overview', () => {
    const href = String(
      liveOrReminderPushHref({
        type: 'live_message',
        challengeId: 'c1',
        postId: 'p1',
        url: '/challenges/c1?tab=live',
      }),
    );
    expect(href).toBe('/challenges/c1?tab=live&postId=p1');
    expect(href).not.toContain('tab=overview');
    expect(href).not.toContain('/submit');
  });

  it('check-in reminder still names Overview and does not reuse Live href', () => {
    const href = String(
      liveOrReminderPushHref({
        type: 'challenge_checkin_reminder',
        challenge_id: 'c1',
        url: '/challenges/c1?tab=live',
      }),
    );
    expect(href).toBe('/challenges/c1?tab=overview');
    expect(String(challengeDetailHref('c1', 'lobby', null, { tab: 'overview' }))).toContain('tab=overview');
  });

  it('in-app Live row also opens Live on that comment', () => {
    const href = String(
      liveNotificationHref({
        type: 'live_reply',
        challengeId: 'c1',
        postId: 'p1',
        commentId: 'c9',
      }),
    );
    expect(href).toContain('tab=live');
    expect(href).toContain('commentId=c9');
  });

  it('opens a Live comment alert on that comment, not Overview', () => {
    const href = String(
      liveNotificationHref({
        type: 'post_comment',
        challenge_id: 'c1',
        post_id: 'p1',
        comment_id: 'c9',
      }),
    );
    expect(href).toContain('tab=live');
    expect(href).toContain('commentId=c9');
    expect(href).not.toContain('/submit');
    expect(href).not.toContain('tab=overview');
  });
});
