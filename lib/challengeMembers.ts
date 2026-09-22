import { comparablePointsFromChallenge, scoringLaneLabel } from '@/lib/comparablePoints';
import { isRosterObserver, isRosterRemoved } from '@/lib/joinRole';
import { personDisplayName } from '@/lib/social';

export const NEEDS_A_SIDE = 'Needs a side';

export const MEMBER_KIND_ORDER = ['admin', 'moderator', 'participant', 'observer'] as const;

export type MemberKind = (typeof MEMBER_KIND_ORDER)[number];

export type ChallengeMemberInput = {
  user_id: string;
  scoring_lane?: string | null;
  roster_role?: string | null;
  status?: string | null;
  profile?: {
    display_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  } | null;
};

export type ChallengeMemberRow = {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  kind: MemberKind;
  subtitle: string;
  laneRank: number;
};

const KIND_RANK: Record<MemberKind, number> = {
  admin: 0,
  moderator: 1,
  participant: 2,
  observer: 3,
};

export function challengeMemberKind(input: {
  userId: string;
  hostId?: string | null;
  moderatorIds?: readonly string[] | null;
  observer?: boolean;
}): MemberKind {
  const userId = String(input.userId ?? '').trim();
  if (userId && userId === String(input.hostId ?? '').trim()) {
    return 'admin';
  }
  if (userId && input.moderatorIds?.includes(userId)) {
    return 'moderator';
  }
  if (input.observer) {
    return 'observer';
  }
  return 'participant';
}

export function challengeMemberSubtitle(input: {
  kind: MemberKind;
  observer?: boolean;
  side?: string | null;
}): string {
  const side = input.side?.trim() || null;
  if (input.kind === 'admin') {
    return side ? `Admin · ${side}` : 'Admin';
  }
  if (input.observer || input.kind === 'observer') {
    return input.kind === 'moderator' ? 'Observer · Moderator' : 'Observer';
  }
  return side ? `Participant · ${side}` : 'Participant';
}

export function sortChallengeMembers(rows: ChallengeMemberRow[]): ChallengeMemberRow[] {
  return [...rows].sort((a, b) => {
    const kind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (kind !== 0) {
      return kind;
    }
    if (a.kind === 'participant') {
      const lane = a.laneRank - b.laneRank;
      if (lane !== 0) {
        return lane;
      }
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function buildChallengeMembers(input: {
  roster?: ChallengeMemberInput[] | null;
  hostId?: string | null;
  moderatorIds?: readonly string[] | null;
  challenge?: {
    scoring_method?: string | null;
    scoring_config?: unknown;
    comparable_points_config?: unknown;
  } | null;
}): ChallengeMemberRow[] {
  const config = comparablePointsFromChallenge(input.challenge);
  const lanes = config?.lanes ?? [];
  const hostId = String(input.hostId ?? '').trim();
  const moderatorIds = input.moderatorIds ?? [];
  const rows = (input.roster ?? [])
    .filter((row) => !isRosterRemoved(row))
    .map((row) => {
      const observer = isRosterObserver(row);
      const kind = challengeMemberKind({
        userId: row.user_id,
        hostId,
        moderatorIds,
        observer,
      });
      const laneId = String(row.scoring_lane ?? '').trim();
      const labeled = scoringLaneLabel(config, laneId);
      const hasLanes = lanes.length > 0 && !observer;
      const side = hasLanes ? labeled || NEEDS_A_SIDE : labeled;
      const laneIndex = laneId ? lanes.findIndex((lane) => lane.id === laneId) : -1;
      const laneRank = observer ? 99 : laneIndex >= 0 ? laneIndex : lanes.length;
      const profile = row.profile;
      return {
        userId: row.user_id,
        name: personDisplayName(profile) || 'blob',
        username: profile?.username?.trim() || null,
        avatarUrl: profile?.avatar_url?.trim() || null,
        kind,
        subtitle: challengeMemberSubtitle({ kind, observer, side }),
        laneRank,
      };
    });
  return sortChallengeMembers(rows);
}
