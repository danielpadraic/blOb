import { describe, expect, it } from 'vitest';

import { challengeTabsForViewer } from '@/components/challenge/ChallengePageTabs';

describe('challenge tabs for invitees', () => {
  it('shows only Overview until a private invitee is on the roster', () => {
    expect(
      challengeTabsForViewer({
        privacyMode: 'private_corporate',
        isParticipant: false,
      }).map((tab) => tab.value),
    ).toEqual(['overview']);
    expect(
      challengeTabsForViewer({
        privacyMode: 'private_corporate',
        isParticipant: true,
      }).map((tab) => tab.value),
    ).toEqual(['overview', 'board', 'feed']);
  });
});
