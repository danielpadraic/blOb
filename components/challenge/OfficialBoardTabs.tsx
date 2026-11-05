import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { ChallengeLeaderboard } from '@/components/challenge/ChallengeLeaderboard';
import { SharedTabs } from '@/components/ui/SharedTabs';
import { useChallengeBoardRealtime } from '@/hooks/useChallengeBoardRealtime';
import { useChallenge, useChallengeParticipants } from '@/hooks/useChallenge';
import { OFFICIAL_BOARD_TABS } from '@/lib/officialCoin';
import { fetchPublicProfilesByIds } from '@/lib/social';

export type OfficialBoardTab = 'week' | 'month';

export const OFFICIAL_BOARD_TAB_OPTIONS = [
  { value: 'week', label: OFFICIAL_BOARD_TABS.week },
  { value: 'month', label: OFFICIAL_BOARD_TABS.month },
] as const satisfies readonly { value: OfficialBoardTab; label: string }[];

/** The monthly scoring room, read on its own. No third score: this is the monthly row's board. */
function OfficialMonthBoard({
  challengeId,
  hostChallengeId,
  viewerId,
  joined,
}: {
  challengeId: string;
  hostChallengeId: string;
  viewerId?: string | null;
  joined: boolean;
}) {
  useChallengeBoardRealtime(challengeId, { boardOnly: true });
  const challengeQuery = useChallenge(challengeId);
  const challenge = challengeQuery.data?.id === challengeId ? challengeQuery.data : null;
  const roster = useChallengeParticipants(challengeId);
  const userIds = (roster.data ?? []).map((row) => row.user_id);
  const profiles = useQuery({
    queryKey: ['challenge-board-profiles', challengeId, userIds.join(',')],
    enabled: userIds.length > 0,
    queryFn: () => fetchPublicProfilesByIds(userIds),
  });
  const boardRoster = useMemo(() => {
    const byId = new Map(
      (profiles.data ?? []).filter((profile) => Boolean(profile?.id)).map((profile) => [profile.id, profile]),
    );
    return (roster.data ?? []).map((row) => ({
      ...row,
      profile: byId.get(row.user_id) ?? row.profile,
    }));
  }, [profiles.data, roster.data]);
  const empty = useMemo(() => new Set<string>(), []);
  if (!challenge) {
    return null;
  }

  return (
    <ChallengeLeaderboard
      challenge={challenge}
      roster={boardRoster}
      completedUserIds={empty}
      joined={joined}
      viewerId={viewerId}
      hostChallengeId={hostChallengeId}
      error={roster.error instanceof Error ? roster.error.message : null}
    />
  );
}

/**
 * Official Fitness Board: This Week reads the weekly host's board, This Month reads the monthly
 * room's board. Same people, same proof, two scores.
 */
export function OfficialBoardTabs({
  hostChallengeId,
  monthChallengeId,
  monthJoined,
  viewerId,
  week,
}: {
  hostChallengeId: string;
  monthChallengeId?: string | null;
  monthJoined: boolean;
  viewerId?: string | null;
  /** The weekly board the screen already renders. */
  week: ReactNode;
}) {
  const [tab, setTab] = useState<OfficialBoardTab>('week');
  if (!monthChallengeId) {
    return <>{week}</>;
  }
  return (
    <View>
      <SharedTabs
        value={tab}
        onChange={setTab}
        options={OFFICIAL_BOARD_TAB_OPTIONS}
        accessibilityLabel="Official Fitness boards"
      />
      <View style={{ marginTop: 12 }}>
        {tab === 'week' ? (
          week
        ) : (
          <OfficialMonthBoard
            challengeId={monthChallengeId}
            hostChallengeId={hostChallengeId}
            viewerId={viewerId}
            joined={monthJoined}
          />
        )}
      </View>
    </View>
  );
}
