import { describe, expect, it } from 'vitest';

import { withCommentQuery } from '@/lib/commentDeepLink';
import { challengeDetailHref, feedHref } from '@/lib/routes';

describe('comment notification deep links', () => {
  it('opens Home with the thread and that comment, not Check In submit', () => {
    const href = withCommentQuery('/feed?postId=post-1', 'comment-9');
    expect(href).toContain('postId=post-1');
    expect(href).toContain('commentId=comment-9');
    expect(href).toContain('comments=1');
    expect(href).not.toContain('/submit');
  });

  it('keeps a Wave player href and adds the comment', () => {
    const href = withCommentQuery('/wave/wave-1?comments=1', 'c-4');
    expect(href).toContain('/wave/wave-1');
    expect(href).toContain('commentId=c-4');
  });

  it('builds a Home comment href from post id', () => {
    expect(feedHref('post-3', { commentId: 'c-8' })).toBe(
      '/feed?postId=post-3&comments=1&commentId=c-8',
    );
  });

  it('sends a challenge comment to the Live feed, not submit', () => {
    expect(String(challengeDetailHref('abc-1', 'feed', 'post-1', { tab: 'feed', commentId: 'c-2' }))).toBe(
      '/challenges/abc-1?returnTo=feed&postId=post-1&tab=feed&comments=1&commentId=c-2',
    );
    expect(String(challengeDetailHref('abc-1', 'feed', 'post-1', { tab: 'feed', commentId: 'c-2' }))).not.toContain(
      '/submit',
    );
  });

  it('does not rewrite Check In submit', () => {
    expect(withCommentQuery('/challenges/abc/submit', 'c-1')).toBe('/challenges/abc/submit');
  });
});
