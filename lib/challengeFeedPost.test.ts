import { describe, expect, it } from 'vitest';

import { feedAudienceForChallenge } from '@/lib/challengeFeedAudience';

describe('feedAudienceForChallenge', () => {
  it('keeps public challenges on Home', () => {
    expect(feedAudienceForChallenge({ visibility: 'public' })).toBe('public');
  });

  it('never announces Private Corporate to the main feed', () => {
    expect(
      feedAudienceForChallenge({
        visibility: 'public',
        privacy_mode: 'private_corporate',
      }),
    ).toBeNull();
  });

  it('skips invite-only private challenges', () => {
    expect(feedAudienceForChallenge({ visibility: 'invite' })).toBeNull();
  });
});
