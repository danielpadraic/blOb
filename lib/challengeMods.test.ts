import { describe, expect, it } from 'vitest';

import {
  challengeMentionMemberIds,
  proxyCheckinBlockedReason,
  proxyCheckinLiveBody,
  proxyLoggedByLine,
  splitProxyCheckinContent,
  viewerCanAppointModerators,
  viewerCanProxyCheckin,
} from '@/lib/challengeMods';

describe('challenge moderators', () => {
  it('lets only the host or @blob appoint, and hides Add on Strict for the host', () => {
    const live = { created_by: 'host', status: 'live', host_rigor: 'normal' };
    expect(viewerCanAppointModerators({ challenge: live, viewerId: 'host' })).toBe(true);
    expect(viewerCanAppointModerators({ challenge: live, viewerId: 'courtney' })).toBe(false);
    expect(
      viewerCanAppointModerators({
        challenge: { ...live, host_rigor: 'strict' },
        viewerId: 'host',
      }),
    ).toBe(false);
    expect(
      viewerCanAppointModerators({
        challenge: { ...live, host_rigor: 'strict' },
        viewerId: 'blob',
        officialOps: true,
      }),
    ).toBe(true);
    expect(
      viewerCanAppointModerators({
        challenge: { ...live, status: 'settled' },
        viewerId: 'host',
      }),
    ).toBe(false);
  });

  it('lets host, mod, and @blob proxy on a live challenge', () => {
    const live = { created_by: 'host', status: 'live', host_rigor: 'normal' };
    expect(viewerCanProxyCheckin({ challenge: live, viewerId: 'host' })).toBe(true);
    expect(
      viewerCanProxyCheckin({
        challenge: live,
        viewerId: 'courtney',
        moderatorIds: ['courtney'],
      }),
    ).toBe(true);
    expect(viewerCanProxyCheckin({ challenge: live, viewerId: 'stranger' })).toBe(false);
    expect(
      viewerCanProxyCheckin({
        challenge: { ...live, status: 'settled' },
        viewerId: 'host',
      }),
    ).toBe(false);
  });

  it('blocks proxy when they dropped unless Count / Excuse can bring them back', () => {
    const live = { created_by: 'host', status: 'live', host_rigor: 'normal' };
    expect(
      proxyCheckinBlockedReason({
        challenge: live,
        viewerId: 'courtney',
        moderatorIds: ['courtney'],
        participantStatus: 'eliminated',
      }),
    ).toBeNull();
    expect(
      proxyCheckinBlockedReason({
        challenge: { ...live, host_rigor: 'strict' },
        viewerId: 'host',
        participantStatus: 'eliminated',
      }),
    ).toBe('They already dropped.');
    expect(
      proxyCheckinLiveBody({ actorName: 'Courtney', participantName: 'Silas', caption: 'legs' }),
    ).toBe('Courtney checked in for Silas.\n\nlegs');
    expect(proxyLoggedByLine('Courtney')).toBe('Logged by Courtney');
  });

  it('splits the Live sentence from the optional caption', () => {
    expect(splitProxyCheckinContent('Courtney checked in for Silas.\n\nlegs')).toEqual({
      sentence: 'Courtney checked in for Silas.',
      caption: 'legs',
    });
    expect(splitProxyCheckinContent('Check-in Complete')).toEqual({
      sentence: null,
      caption: 'Check-in Complete',
    });
  });

  it('keeps assigned mods in the mention list even when they are not on the roster', () => {
    expect(
      challengeMentionMemberIds({
        createdBy: 'host',
        rosterUserIds: ['p1'],
        moderatorIds: ['courtney'],
      }).sort(),
    ).toEqual(['courtney', 'host', 'p1']);
  });
});
