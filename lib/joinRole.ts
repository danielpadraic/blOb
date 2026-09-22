import {
  comparablePointsFromChallenge,
  comparablePointsLaneSubline,
  scoringLaneName,
  type ScoringLane,
} from '@/lib/comparablePoints';
import { isOfficialCashChallenge, hostRigorOf } from '@/lib/hostRigor';
import { isPrivateCorporate } from '@/lib/privacyMode';

export const ROSTER_ROLE_PARTICIPANT = 'participant' as const;
export const ROSTER_ROLE_OBSERVER = 'observer' as const;

export type RosterRole = typeof ROSTER_ROLE_PARTICIPANT | typeof ROSTER_ROLE_OBSERVER;

export type JoinRolePicks = {
  rosterRole: RosterRole | null;
  scoringLane: string | null;
  selfModerator: boolean;
};

export function isPrivateJoinRoom(challenge?: {
  privacy_mode?: string | null;
  visibility?: string | null;
} | null): boolean {
  const privacy = String(challenge?.privacy_mode ?? '').toLowerCase();
  if (privacy === 'private' || privacy === 'private_corporate') {
    return true;
  }
  const visibility = String(challenge?.visibility ?? '').toLowerCase();
  return visibility === 'private' || visibility === 'invite';
}

/** Private / private_corporate Join uses the role sheet. Official cash stays the old confirm. */
export function usesJoinRoleSheet(challenge?: {
  privacy_mode?: string | null;
  visibility?: string | null;
  is_official?: boolean | null;
} | null): boolean {
  if (!challenge || challenge.is_official) {
    return false;
  }
  return isPrivateJoinRoom(challenge);
}

export function allowsSelfModeratorCheckbox(challenge?: {
  privacy_mode?: string | null;
  visibility?: string | null;
  is_official?: boolean | null;
  host_rigor?: string | null;
  currency?: string | null;
  challenge_lane?: string | null;
} | null): boolean {
  if (!usesJoinRoleSheet(challenge)) {
    return false;
  }
  if (isOfficialCashChallenge(challenge)) {
    return false;
  }
  const rigor = hostRigorOf(challenge);
  return rigor === 'friendly' || rigor === 'normal';
}

export function joinScoringLanes(challenge?: {
  scoring_method?: string | null;
  scoring_config?: unknown;
  comparable_points_config?: unknown;
} | null): ScoringLane[] {
  return comparablePointsFromChallenge(challenge)?.lanes ?? [];
}

export function joinLaneHelper(challenge?: {
  scoring_method?: string | null;
  scoring_config?: unknown;
  comparable_points_config?: unknown;
} | null): string {
  const config = comparablePointsFromChallenge(challenge);
  return config ? comparablePointsLaneSubline(config) : '';
}

export function joinLaneLabel(lane: ScoringLane): string {
  return scoringLaneName(lane) || lane.id;
}

export function isRosterObserver(row?: { roster_role?: string | null } | null): boolean {
  return String(row?.roster_role ?? '').toLowerCase() === ROSTER_ROLE_OBSERVER;
}

export function isRosterParticipant(row?: { roster_role?: string | null } | null): boolean {
  return !isRosterObserver(row);
}

export function joinRoleReady(
  picks: JoinRolePicks,
  challenge?: {
    scoring_method?: string | null;
    scoring_config?: unknown;
    comparable_points_config?: unknown;
  } | null,
): boolean {
  if (picks.rosterRole !== ROSTER_ROLE_PARTICIPANT && picks.rosterRole !== ROSTER_ROLE_OBSERVER) {
    return false;
  }
  if (picks.rosterRole === ROSTER_ROLE_OBSERVER) {
    return true;
  }
  const lanes = joinScoringLanes(challenge);
  if (lanes.length === 0) {
    return true;
  }
  return lanes.some((lane) => lane.id === picks.scoringLane);
}

export function emptyJoinRolePicks(): JoinRolePicks {
  return { rosterRole: null, scoringLane: null, selfModerator: false };
}
