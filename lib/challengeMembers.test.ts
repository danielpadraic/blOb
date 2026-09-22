import { describe, expect, it } from 'vitest';

import { emptyActivity } from '@/lib/comparablePoints';
import {
  buildChallengeMembers,
  challengeMemberKind,
  challengeMemberSubtitle,
} from '@/lib/challengeMembers';

const pinnacle = {
  scoring_method: 'comparable_points',
  scoring_config: {
    version: 1,
    lanes: [
      { id: 'rookie', name: 'Rookie' },
      { id: 'veteran', name: 'Veteran' },
    ],
    activities: [
      emptyActivity({
        id: 'act-dials',
        name: 'Dials',
        unit: 'dials',
        parity_qty: 2800,
        lane_ids: ['rookie'],
      }),
    ],
  },
};

describe('challenge members list', () => {
  it('sorts Admin, Moderators, Participants by side, then Observers, alpha inside a group', () => {
    const rows = buildChallengeMembers({
      challenge: pinnacle,
      hostId: 'host',
      moderatorIds: ['mod-z', 'mod-obs'],
      roster: [
        {
          user_id: 'obs-a',
          roster_role: 'observer',
          profile: { display_name: 'Ann', username: 'ann' },
        },
        {
          user_id: 'vet-z',
          roster_role: 'participant',
          scoring_lane: 'veteran',
          profile: { display_name: 'Zed', username: 'zed' },
        },
        {
          user_id: 'rook-b',
          roster_role: 'participant',
          scoring_lane: 'rookie',
          profile: { display_name: 'Bea', username: 'bea' },
        },
        {
          user_id: 'none-c',
          roster_role: 'participant',
          profile: { display_name: 'Cam', username: 'cam' },
        },
        {
          user_id: 'host',
          roster_role: 'participant',
          scoring_lane: 'veteran',
          profile: { display_name: 'Host', username: 'host' },
        },
        {
          user_id: 'mod-z',
          roster_role: 'participant',
          scoring_lane: 'rookie',
          profile: { display_name: 'Zed Mod', username: 'zmod' },
        },
        {
          user_id: 'mod-obs',
          roster_role: 'observer',
          profile: { display_name: 'Pat', username: 'pat' },
        },
        {
          user_id: 'gone',
          roster_role: 'participant',
          status: 'withdrawn',
          profile: { display_name: 'Gone', username: 'gone' },
        },
      ],
    });
    expect(rows.map((row) => row.userId)).toEqual([
      'host',
      'mod-obs',
      'mod-z',
      'rook-b',
      'vet-z',
      'none-c',
      'obs-a',
    ]);
    expect(rows[0]?.subtitle).toBe('Admin · Veteran');
    expect(rows[1]?.subtitle).toBe('Observer · Moderator');
    expect(rows[2]?.subtitle).toBe('Participant · Rookie');
    expect(rows[3]?.subtitle).toBe('Participant · Rookie');
    expect(rows[4]?.subtitle).toBe('Participant · Veteran');
    expect(rows[5]?.subtitle).toBe('Participant · Needs a side');
    expect(rows[6]?.subtitle).toBe('Observer');
  });

  it('labels a joined observer without a side', () => {
    expect(challengeMemberKind({ userId: 'o', observer: true })).toBe('observer');
    expect(challengeMemberSubtitle({ kind: 'observer', observer: true })).toBe('Observer');
  });
});
