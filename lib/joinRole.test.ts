import { describe, expect, it } from 'vitest';

import { emptyActivity } from '@/lib/comparablePoints';
import {
  allowsSelfModeratorCheckbox,
  emptyJoinRolePicks,
  isRosterObserver,
  isRosterRemoved,
  joinRoleReady,
  REMOVED_NO_REJOIN_COPY,
  usesJoinRoleSheet,
} from '@/lib/joinRole';

const pinnacle = {
  privacy_mode: 'private_corporate',
  is_official: false,
  host_rigor: 'friendly',
  scoring_method: 'comparable_points',
  scoring_config: {
    version: 1,
    parity_points: 16000,
    extras_keep_adding: true,
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
      emptyActivity({
        id: 'act-ap',
        name: 'AP',
        unit: 'USD',
        parity_qty: 16000,
        input_kind: 'money',
        lane_ids: ['rookie', 'veteran'],
      }),
    ],
  },
};

describe('join role sheet', () => {
  it('opens on private_corporate and stays off Official cash', () => {
    expect(usesJoinRoleSheet(pinnacle)).toBe(true);
    expect(usesJoinRoleSheet({ privacy_mode: 'private', is_official: false })).toBe(true);
    expect(
      usesJoinRoleSheet({
        privacy_mode: 'public',
        is_official: true,
        currency: 'bucks',
      }),
    ).toBe(false);
    expect(allowsSelfModeratorCheckbox(pinnacle)).toBe(true);
    expect(
      allowsSelfModeratorCheckbox({
        ...pinnacle,
        host_rigor: 'strict',
      }),
    ).toBe(false);
    expect(
      allowsSelfModeratorCheckbox({
        is_official: true,
        currency: 'bucks',
        privacy_mode: 'public',
        host_rigor: 'friendly',
      }),
    ).toBe(false);
  });

  it('requires a side for a Participant on Pinnacle and not for an Observer', () => {
    expect(joinRoleReady(emptyJoinRolePicks(), pinnacle)).toBe(false);
    expect(
      joinRoleReady({ rosterRole: 'participant', scoringLane: null, selfModerator: false }, pinnacle),
    ).toBe(false);
    expect(
      joinRoleReady({ rosterRole: 'participant', scoringLane: 'veteran', selfModerator: false }, pinnacle),
    ).toBe(true);
    expect(
      joinRoleReady({ rosterRole: 'observer', scoringLane: null, selfModerator: true }, pinnacle),
    ).toBe(true);
  });

  it('treats a withdrawn seat as removed, not a rejoinable join', () => {
    expect(isRosterRemoved({ status: 'withdrawn' })).toBe(true);
    expect(isRosterRemoved({ status: 'refunded_pre_start' })).toBe(true);
    expect(isRosterRemoved({ status: 'active' })).toBe(false);
    expect(isRosterRemoved({ status: 'joined' })).toBe(false);
    expect(REMOVED_NO_REJOIN_COPY).toMatch(/ask the host to add you back/i);
  });

  it('treats missing roster_role as a participant', () => {
    expect(isRosterObserver({ roster_role: 'observer' })).toBe(true);
    expect(isRosterObserver({ roster_role: 'participant' })).toBe(false);
    expect(isRosterObserver({})).toBe(false);
  });
});
