import { useMemo } from 'react';
import { Platform, View } from 'react-native';

import { FieldNoteButton } from '@/components/challenge/FieldNote';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import type { Challenge, ChallengeParticipantWithProfile } from '@/lib/types';
import { isLiveCompetitorStatus } from '@/lib/challenges';
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
  joined = false,
}: {
  challenge: Challenge;
  roster: ChallengeParticipantWithProfile[] | undefined;
  completedUserIds: Set<string>;
  joined?: boolean;
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
  const empty = remaining.length === 0 && dropped.length === 0;

  return (
    <Card className="gap-3">
      <View className="flex-row items-center" style={{ marginLeft: -8 }}>
        <AppText className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Board
        </AppText>
        <FieldNoteButton note="board" />
      </View>
      <View className="flex-row" style={{ gap: 8 }}>
        <Stat label={copy('board.remaining')} value={String(remainingCount)} />
        <Stat label={copy('board.caughtUp')} value={String(completed.length)} />
        <Stat label={copy('board.dropped')} value={String(dropped.length)} />
      </View>
      <View className="flex-row flex-wrap items-center" style={{ gap: 2 }}>
        <AppText className="text-sm font-semibold text-charcoal">
          {copy(joined ? 'board.yourShareIfFinish' : 'board.shareIfFinish')}
        </AppText>
        <StakeAmount
          amount={share}
          currency={challenge.currency}
          size={16}
          textClassName="text-sm font-semibold text-charcoal"
          zeroAsNumber
        />
        <FieldNoteButton note="share" />
      </View>
      {empty ? (
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
      className="min-w-0 flex-1 items-center"
      style={{
        backgroundColor: THEME.accentSoft,
        borderRadius: 12,
        padding: 12,
      }}>
      <AppText className="text-[26px] font-extrabold leading-8 text-charcoal">{value}</AppText>
      <AppText
        className="mt-1 text-[10px] font-semibold text-muted"
        numberOfLines={1}
        ellipsizeMode="clip"
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{
          letterSpacing: 0,
          ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as const } : null),
        }}>
        {label}
      </AppText>
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
