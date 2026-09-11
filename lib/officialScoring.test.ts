import { describe, expect, it } from 'vitest';

import { OFFICIAL_BOB_ID } from '@/lib/official';
import { canOpenOfficialTools, canSeeOfficialOperatorChrome } from '@/lib/officialScoring';

const peerWalk = {
  created_by: 'user-daniel',
  status: 'open',
  is_official: false,
};

const officialWeek = {
  created_by: OFFICIAL_BOB_ID,
  status: 'live',
  is_official: true,
};

const blob = { id: OFFICIAL_BOB_ID, is_official: true, username: 'blob' };
const peer = { id: 'user-daniel', is_official: false, username: 'daniel' };

describe('Official tools chrome', () => {
  it('hides Official tools from a peer host', () => {
    expect(
      canOpenOfficialTools({ challenge: peerWalk, viewerId: peer.id, profile: peer }),
    ).toBe(false);
    expect(canSeeOfficialOperatorChrome({ challenge: peerWalk, profile: peer })).toBe(false);
  });

  it('shows Official tools for @blob', () => {
    expect(
      canOpenOfficialTools({ challenge: officialWeek, viewerId: blob.id, profile: blob }),
    ).toBe(true);
    expect(
      canOpenOfficialTools({ challenge: peerWalk, viewerId: blob.id, profile: blob }),
    ).toBe(true);
    expect(canSeeOfficialOperatorChrome({ challenge: officialWeek, profile: peer })).toBe(true);
  });
});
