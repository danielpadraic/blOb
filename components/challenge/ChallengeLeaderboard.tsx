import { useMemo } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import type { Challenge, ChallengeParticipantWithProfile } from '@/lib/types';
import { isLiveCompetitorStatus } from '@/lib/challenges';
import { formatWallet } from '@/lib/currency';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import { utcDateStamp } from '@/utils/dates';

type BoardRow = {
  userId: string;
  name: string;
  bucket: 'remaining' | 'completed' | 'dropped';
  days: number;
};

export function ChallengeLeaderboard({
  challenge,
  roster,
  completedUserIds,
}: {
  challenge: Challenge;
  roster: ChallengeParticipantWithProfile[] | undefined;
  completedUserIds: Set<string>;
}) {
  const rows = useMemo<BoardRow[]>(() => {
    return (roster ?? []).map((row) => {
      const dropped =
        Boolean(row.eliminated_at) ||
        row.status === 'eliminated' ||
        row.status === 'failed' ||
        row.status === 'refunded_pre_start';
      const remaining = !dropped && isLiveCompetitorStatus(row.status);
      const completed = remaining && completedUserIds.has(row.user_id);
      const name =
        row.profile?.display_name?.trim() ||
        row.profile?.username ||
        'blob';
      return {
        userId: row.user_id,
        name,
        bucket: dropped ? 'dropped' : completed ? 'completed' : remaining ? 'remaining' : 'dropped',
        days: Number(row.days_completed) || 0,
      };
    });
  }, [completedUserIds, roster]);

  const remaining = rows.filter((row) => row.bucket === 'remaining' || row.bucket === 'completed');
  const completed = rows.filter((row) => row.bucket === 'completed');
  const dropped = rows.filter((row) => row.bucket === 'dropped');
  const remainingCount = remaining.length;
  const pot = Number(challenge.prize_pool) || 0;
  const share = remainingCount > 0 ? pot / remainingCount : 0;

  return (
    <Card className="gap-3">
      <AppText className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        Board
      </AppText>
      <View className="flex-row gap-2">
        <Stat label={copy('board.remaining')} value={String(remainingCount)} />
        <Stat label={copy('board.donePeriod')} value={String(completed.length)} />
        <Stat label={copy('board.dropped')} value={String(dropped.length)} />
      </View>
      <AppText className="text-sm font-semibold text-charcoal">
        {copy('board.liveShare', 'neutral', { amount: formatWallet(share, challenge.currency) })}
      </AppText>
      {remaining.length === 0 && dropped.length === 0 ? (
        <AppText className="text-sm text-muted">No one on the board yet.</AppText>
      ) : (
        <View className="gap-1.5">
          {remaining.map((row) => (
            <Row key={row.userId} name={row.name} tag={row.bucket === 'completed' ? 'Done' : 'In'} />
          ))}
          {dropped.map((row) => (
            <Row key={row.userId} name={row.name} tag="Out" muted />
          ))}
        </View>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View
      className="flex-1 items-center py-2"
      style={{ backgroundColor: THEME.accentSoft, borderRadius: 14 }}>
      <AppText className="text-[18px] font-extrabold text-charcoal">{value}</AppText>
      <AppText className="text-[11px] font-semibold text-muted">{label}</AppText>
    </View>
  );
}

function Row({ name, tag, muted }: { name: string; tag: string; muted?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <AppText
        className="flex-1 text-sm font-semibold"
        style={{ color: muted ? THEME.textMuted : THEME.textPrimary }}
        numberOfLines={1}>
        {name}
      </AppText>
      <AppText className="text-[12px] font-semibold" style={{ color: THEME.accent }}>
        {tag}
      </AppText>
    </View>
  );
}

export function todayStamp(): string {
  return utcDateStamp();
}
