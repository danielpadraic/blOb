import { useMemo } from 'react';
import { Platform, View } from 'react-native';

import { FieldNoteLabel } from '@/components/challenge/FieldNote';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import type { Challenge, ChallengeParticipantWithProfile } from '@/lib/types';
import { usesPointsBoard } from '@/lib/challengeExperience';
import { isLiveCompetitor } from '@/lib/challenges';
import { formatPoints } from '@/lib/comparablePoints';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import { utcDateStamp } from '@/utils/dates';

type ConsistencyRow = {
  userId: string;
  name: string;
  bucket: 'remaining' | 'completed' | 'dropped';
  days: number;
};

type PointsRow = {
  userId: string;
  name: string;
  points: number;
  eligible: boolean;
  rank: number | null;
};

function displayName(row: ChallengeParticipantWithProfile): string {
  return row.profile?.display_name?.trim() || row.profile?.username || 'blob';
}

export function ChallengeLeaderboard({
  challenge,
  roster,
  completedUserIds,
  joined = false,
  viewerId,
}: {
  challenge: Challenge;
  roster: ChallengeParticipantWithProfile[] | undefined;
  completedUserIds: Set<string>;
  joined?: boolean;
  viewerId?: string | null;
}) {
  if (usesPointsBoard(challenge)) {
    return (
      <PointsBoard
        challenge={challenge}
        roster={roster}
        joined={joined}
        viewerId={viewerId}
      />
    );
  }
  return (
    <ConsistencyBoard
      challenge={challenge}
      roster={roster}
      completedUserIds={completedUserIds}
      joined={joined}
    />
  );
}

function ConsistencyBoard({
  challenge,
  roster,
  completedUserIds,
  joined,
}: {
  challenge: Challenge;
  roster: ChallengeParticipantWithProfile[] | undefined;
  completedUserIds: Set<string>;
  joined: boolean;
}) {
  const rows = useMemo<ConsistencyRow[]>(() => {
    return (roster ?? []).map((row) => {
      const dropped =
        Boolean(row.eliminated_at) ||
        row.status === 'eliminated' ||
        row.status === 'failed' ||
        row.status === 'refunded_pre_start';
      const remaining = !dropped && isLiveCompetitor(row);
      const completed = remaining && completedUserIds.has(row.user_id);
      return {
        userId: row.user_id,
        name: displayName(row),
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
      <FieldNoteLabel
        note="board"
        textClassName="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        Board
      </FieldNoteLabel>
      <View className="flex-row" style={{ gap: 8 }}>
        <Stat label={copy('board.remaining')} value={String(remainingCount)} />
        <Stat label={copy('board.caughtUp')} value={String(completed.length)} />
        <Stat label={copy('board.dropped')} value={String(dropped.length)} />
      </View>
      <ShareLine challenge={challenge} share={share} joined={joined} points={false} />
      {empty ? (
        <AppText className="text-sm text-muted">No one on the board yet.</AppText>
      ) : (
        <View className="gap-1.5">
          {remaining.map((row) => (
            <Row
              key={row.userId}
              name={row.name}
              tag={row.bucket === 'completed' ? 'Done' : 'In'}
            />
          ))}
          {dropped.map((row) => (
            <Row key={row.userId} name={row.name} tag="Out" muted />
          ))}
        </View>
      )}
    </Card>
  );
}

function PointsBoard({
  challenge,
  roster,
  joined,
  viewerId,
}: {
  challenge: Challenge;
  roster: ChallengeParticipantWithProfile[] | undefined;
  joined: boolean;
  viewerId?: string | null;
}) {
  const rows = useMemo<PointsRow[]>(() => {
    const mapped = (roster ?? []).map((row) => {
      const dropped =
        Boolean(row.eliminated_at) ||
        row.status === 'eliminated' ||
        row.status === 'failed' ||
        row.status === 'refunded_pre_start';
      const eligible = !dropped && isLiveCompetitor(row);
      return {
        userId: row.user_id,
        name: displayName(row),
        points: Math.max(Number(row.points) || 0, 0),
        eligible,
        joinedAt: row.joined_at ?? '',
      };
    });
    const live = mapped
      .filter((row) => row.eligible)
      .sort((a, b) => b.points - a.points || a.joinedAt.localeCompare(b.joinedAt));
    const ranks = new Map(live.map((row, index) => [row.userId, index + 1]));
    const dropped = mapped
      .filter((row) => !row.eligible)
      .sort((a, b) => b.points - a.points || a.joinedAt.localeCompare(b.joinedAt));
    return [...live, ...dropped].map((row) => ({
      userId: row.userId,
      name: row.name,
      points: row.points,
      eligible: row.eligible,
      rank: ranks.get(row.userId) ?? null,
    }));
  }, [roster]);

  const live = rows.filter((row) => row.eligible);
  const dropped = rows.filter((row) => !row.eligible);
  const pot = Number(challenge.prize_pool) || 0;
  const share = live.length > 0 ? pot / live.length : 0;
  const myRank = viewerId ? rows.find((row) => row.userId === viewerId)?.rank ?? null : null;
  const empty = rows.length === 0;

  return (
    <Card className="gap-3">
      <AppText className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        Board
      </AppText>
      <View className="flex-row" style={{ gap: 8 }}>
        <Stat label={copy('board.in')} value={String(live.length)} />
        <Stat label={copy('board.out')} value={String(dropped.length)} />
        <Stat
          label={copy('board.yourRank')}
          value={joined && myRank ? `#${myRank}` : '—'}
        />
      </View>
      <ShareLine challenge={challenge} share={share} joined={joined} points />
      {empty ? (
        <AppText className="text-sm text-muted">No one on the board yet.</AppText>
      ) : (
        <View className="gap-2">
          {rows.map((row) => (
            <PointsRowView
              key={row.userId}
              row={row}
              mine={Boolean(viewerId && row.userId === viewerId)}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

function ShareLine({
  challenge,
  share,
  joined,
  points,
}: {
  challenge: Challenge;
  share: number;
  joined: boolean;
  points: boolean;
}) {
  return (
    <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
      <FieldNoteLabel note="share" textClassName="text-sm font-semibold text-charcoal">
        {copy(
          points
            ? joined
              ? 'board.yourShareIfPlace'
              : 'board.shareIfPlace'
            : joined
              ? 'board.yourShareIfFinish'
              : 'board.shareIfFinish',
        )}
      </FieldNoteLabel>
      <StakeAmount
        amount={share}
        currency={challenge.currency}
        size={16}
        textClassName="text-sm font-semibold text-charcoal"
        zeroAsNumber
      />
    </View>
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

function PointsRowView({ row, mine }: { row: PointsRow; mine: boolean }) {
  return (
    <View className="flex-row items-center" style={{ gap: 10 }}>
      <View
        className="h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: THEME.accentSoft }}>
        <AppText className="text-[12px] font-bold" style={{ color: THEME.accent }}>
          {row.rank ? String(row.rank) : '—'}
        </AppText>
      </View>
      <AppText
        className="min-w-0 flex-1 text-sm font-semibold"
        style={{ color: row.eligible ? THEME.textPrimary : THEME.textMuted }}
        numberOfLines={1}>
        {row.name}
        {mine ? ' · you' : ''}
      </AppText>
      <AppText
        className="text-[13px] font-semibold"
        style={{ color: row.eligible ? THEME.textPrimary : THEME.textMuted }}>
        {formatPoints(row.points)} pts
      </AppText>
      <AppText className="text-[12px] font-semibold" style={{ color: THEME.accent }}>
        {row.eligible ? 'In' : 'Out'}
      </AppText>
    </View>
  );
}

export function todayStamp(): string {
  return utcDateStamp();
}
