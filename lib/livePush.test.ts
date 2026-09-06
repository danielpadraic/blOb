import { describe, expect, it } from 'vitest';

import { liveChatPushCopy, liveChatSnippet } from '@/lib/livePush';
import { challengeDetailHref } from '@/lib/routes';

describe('live chat push copy', () => {
  it('titles the challenge, not Bob, and keeps the first 80 characters', () => {
    const copy = liveChatPushCopy({
      name: 'Sam',
      challengeTitle: 'Morning miles',
      text: '  hello   from the lobby  ',
    });
    expect(copy.title).toBe('Sam in Morning miles');
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
  it('opens Live on that post, not camera submit', () => {
    const href = String(challengeDetailHref('c1', 'feed', 'p1', { tab: 'feed' }));
    expect(href).toBe('/challenges/c1?returnTo=feed&postId=p1&tab=feed');
    expect(href).not.toContain('/submit');
  });

  it('opens a Live check-in receipt on Live, not Overview camera', () => {
    const href = String(challengeDetailHref('c1', 'feed', 'p9', { tab: 'feed' }));
    expect(href).toContain('tab=feed');
    expect(href).toContain('postId=p9');
    expect(href).not.toContain('/submit');
  });

  it('scrolls a Live reply to the comment id', () => {
    const href = String(
      challengeDetailHref('c1', 'feed', 'p1', { tab: 'feed', commentId: 'c9' }),
    );
    expect(href).toContain('tab=feed');
    expect(href).toContain('commentId=c9');
    expect(href).not.toContain('/submit');
  });
});
