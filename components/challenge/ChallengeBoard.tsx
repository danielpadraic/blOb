import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ChallengeLifecycleStatus } from '@/components/challenge/ChallengeLifecycleStatus';
import { MissBudgetLines } from '@/components/challenge/MissBudgetLines';
import { FieldNoteLabel } from '@/components/challenge/FieldNote';
import { SettlementSummary } from '@/components/challenge/SettlementSummary';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { BoardAdjustButton, useHostAdjustUi } from '@/components/challenge/HostAdjustHost';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { MascotState } from '@/components/mascot/MascotState';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import {
  boardCompletersCount,
  boardEmptyCopy,
  boardQuantityProgress,
  boardRowTag,
  boardScoreLabel,
  boardSettledCopy,
  buildBoard,
  quantityBoardHeaderLine,
  rankBoardRows,
} from '@/lib/board';
import { usesQuantityScoring, usesPointsBoard } from '@/lib/challengeExperience';
import { storedDurationDays } from '@/lib/challengeGoal';
import { challengeTargetCount } from '@/lib/challenges';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import type { Challenge, ChallengeParticipantWithProfile, ChallengeSettlementView } from '@/lib/types';

type ChallengeBoardProps = {
  challenge: Challenge;
  roster: ChallengeParticipantWithProfile[] | undefined;
  completedUserIds: Set<string>;
  joined?: boolean;
  viewerId?: string | null;
  settlement?: ChallengeSettlementView | null;
  variant?: 'full' | 'compact';
  showReceipt?: boolean;
  onOpenReceipt?: () => void;
  error?: string | null;
  missesUsed?: number;
};

export function ChallengeBoard({
  challenge,
  roster,
  completedUserIds,
  joined = false,
  viewerId,
  settlement,
  variant = 'full',
  showReceipt = false,
  onOpenReceipt,
  error,
  missesUsed = 0,
}: ChallengeBoardProps) {
  const [receiptOpen, setReceiptOpen] = useState(showReceipt);
  const quantityBoard = usesQuantityScoring(challenge);
  const view = useMemo(
    () =>
      buildBoard({
        status: challenge.status,
        prizePool: Number(challenge.prize_pool) || Number(settlement?.settlement.prize_pool) || 0,
        participants: (roster ?? []).map((row) => ({
          user_id: row.user_id,
          days_completed: row.days_completed,
          points: row.points,
          distance_meters_total: row.distance_meters_total,
          metric_totals: row.metric_totals,
          status: row.status,
          eliminated_at: row.eliminated_at,
          joined_at: row.joined_at,
          completed_at: row.completed_at,
          display_name: row.profile?.display_name,
          username: row.profile?.username,
          avatar_url: row.profile?.avatar_url,
        })),
        completedUserIds: quantityBoard ? [] : completedUserIds,
        settlement: settlement
          ? {
              winner_count: settlement.settlement.winner_count,
              prize_pool: settlement.settlement.prize_pool,
              payouts: settlement.payouts,
            }
          : null,
        viewerId,
        joined,
        currency: challenge.currency,
      }),
    [
      challenge.currency,
      challenge.prize_pool,
      challenge.status,
      completedUserIds,
      joined,
      quantityBoard,
      roster,
      settlement,
      viewerId,
    ],
  );
  const settledCopy = boardSettledCopy(view);
  const openReceipt = receiptOpen || showReceipt;
  const { isActor } = useHostAdjustUi();
  const pointsBoard = usesPointsBoard(challenge);
  const quantityOrPoints = quantityBoard || pointsBoard;
  const requiredDays = storedDurationDays(challenge) ?? challengeTargetCount(challenge);
  const progressByUser = useMemo(() => {
    const map = new Map<string, ReturnType<typeof boardQuantityProgress>>();
    if (!quantityBoard) {
      return map;
    }
    for (const row of roster ?? []) {
      map.set(
        row.user_id,
        boardQuantityProgress(challenge, {
          distanceMeters: row.distance_meters_total,
          metricTotals: row.metric_totals,
          points: row.points,
        }),
      );
    }
    return map;
  }, [challenge, quantityBoard, roster]);
  const rankedPeople = useMemo(
    () =>
      view.people.map((row) => ({
        ...row,
        quantity: progressByUser.get(row.userId)?.logged ?? 0,
      })),
    [progressByUser, view.people],
  );
  const racing = rankedPeople.filter((row) => row.bucket !== 'dropped');
  const doneCount = quantityBoard
    ? racing.filter((row) => progressByUser.get(row.userId)?.done).length
    : boardCompletersCount(view.people);
  const inCount = quantityBoard ? racing.length - doneCount : view.remainingCount;
  const headerLine = quantityBoard
    ? quantityBoardHeaderLine(inCount, doneCount, view.droppedCount)
    : pointsBoard
      ? `${copy('board.in')} ${view.remainingCount} · ${copy('board.completers')} ${doneCount}${
          view.droppedCount > 0 ? ` · ${copy('board.dropped')} ${view.droppedCount}` : ''
        }`
      : `${copy('board.remaining')} ${view.remainingCount} · ${copy('board.caughtUp')} ${view.caughtUpCount} · ${copy('board.dropped')} ${view.droppedCount}`;
  const rows = useMemo(
    () =>
      rankBoardRows(
        rankedPeople,
        quantityBoard ? 'quantity' : pointsBoard ? 'points' : 'days',
      ),
    [pointsBoard, quantityBoard, rankedPeople],
  );

  function toggleReceipt() {
    if (onOpenReceipt) {
      onOpenReceipt();
      return;
    }
    setReceiptOpen((current) => !current);
  }

  if (variant === 'compact') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open board"
        onPress={onOpenReceipt}
        style={{ minHeight: 44 }}>
        <View style={{ gap: 6 }}>
          <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
            {headerLine}
          </AppText>
        </View>
      </Pressable>
    );
  }

  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <FieldNoteLabel
          note={quantityBoard ? 'boardQuantity' : pointsBoard ? 'boardPoints' : 'board'}
          textClassName="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Board
        </FieldNoteLabel>
        <ChallengeLifecycleStatus compact status={challenge.status} />
      </View>

      <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
        {headerLine}
      </AppText>
      {isActor && quantityOrPoints ? (
        <AppText className="text-[12px] leading-5" style={{ color: THEME.textMuted }}>
          {copy('board.adjustMilesHidden')}
        </AppText>
      ) : null}
      {quantityBoard ? null : <MissBudgetLines challenge={challenge} used={missesUsed} />}

      {view.settled ? (
        <View className="gap-2">
          {settledCopy.showBob ? (
            <MascotState kind="success" compact title={settledCopy.title} body={settledCopy.body} />
          ) : (
            <View>
              <AppText className="text-[15px] font-bold text-charcoal">{settledCopy.title}</AppText>
              <AppText className="mt-1 text-sm leading-5 text-muted">{settledCopy.body}</AppText>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open receipt"
            onPress={toggleReceipt}
            className="items-center justify-center"
            style={{
              minHeight: 44,
              borderRadius: 999,
              backgroundColor: THEME.accentSoft,
              paddingHorizontal: 16,
            }}>
            <AppText className="text-[13px] font-bold" style={{ color: THEME.accent }}>
              Receipt
            </AppText>
          </Pressable>
        </View>
      ) : (
        <ShareLine
          challenge={challenge}
          share={view.shareEstimate}
          prizePool={view.prizePool}
          joined={joined}
          pointsBoard={pointsBoard}
        />
      )}

      {error ? (
        <AppText className="text-sm leading-5 text-coral-dark">
          Couldn’t load the board.{' '}
          {error.includes('network') || error.includes('offline')
            ? 'You’re offline. It will update when you’re back.'
            : 'Try again.'}
        </AppText>
      ) : null}

      {view.empty ? (
        <MascotState kind="empty" compact title={boardEmptyCopy(view)} />
      ) : (
        <View className="gap-1">
          {rows.map((row) => (
            <BoardRankRow
              key={row.userId}
              rank={row.rank == null ? '—' : String(row.rank)}
              name={row.name}
              you={row.you}
              username={row.username}
              userId={row.userId}
              avatarUrl={row.avatarUrl}
              score={
                quantityBoard
                  ? progressByUser.get(row.userId)?.label?.trim() || '0'
                  : pointsBoard
                    ? boardScoreLabel(row, { pointsBoard: true, requiredDays })
                    : `${Number(row.days) || 0} / ${requiredDays}`
              }
              status={boardRowTag(row, view.settled, {
                quantityDone: quantityBoard ? Boolean(progressByUser.get(row.userId)?.done) : false,
              })}
              muted={row.bucket === 'dropped'}
              payout={view.settled ? row.payout : null}
              currency={challenge.currency}
              showAdjust={!view.settled}
              participantStatus={(roster ?? []).find((item) => item.user_id === row.userId)?.status}
            />
          ))}
        </View>
      )}

      {view.settled && openReceipt && settlement ? (
        <SettlementSummary
          settlement={settlement}
          userId={viewerId ?? undefined}
          joined={joined}
          currency={challenge.currency}
          official={Boolean(challenge.is_official)}
          entryFeePaid={
            (roster ?? []).find((row) => row.user_id === viewerId)?.buy_in_paid ??
            challenge.buy_in_amount
          }
          hostContribution={challenge.creator_contribution}
          prizePool={challenge.prize_pool}
        />
      ) : null}
    </Card>
  );
}

function ShareLine({
  challenge,
  share,
  prizePool,
  joined,
  pointsBoard,
}: {
  challenge: Challenge;
  share: number;
  prizePool: number;
  joined: boolean;
  pointsBoard: boolean;
}) {
  return (
    <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
      <FieldNoteLabel
        note={pointsBoard ? 'prizePool' : 'share'}
        textClassName="text-sm font-semibold leading-5 text-charcoal">
        {pointsBoard
          ? copy('board.totalPrizePool')
          : copy(joined ? 'board.yourShareIfFinish' : 'board.shareIfFinish')}
      </FieldNoteLabel>
      <StakeAmount
        amount={pointsBoard ? prizePool : share}
        currency={challenge.currency}
        size={16}
        textClassName="text-sm font-semibold text-charcoal"
        zeroAsNumber
      />
    </View>
  );
}

function boardRowPlayerName(name: string, username: string | null | undefined, you?: boolean): string {
  const raw = String(name ?? '').trim();
  const handle = String(username ?? '')
    .trim()
    .replace(/^@/, '');
  const looksLikeHandle = Boolean(handle) && raw.toLowerCase() === handle.toLowerCase();
  const base =
    raw && raw.toLowerCase() !== 'blob' && !looksLikeHandle
      ? raw
      : handle
        ? `@${handle}`
        : raw && raw.toLowerCase() !== 'blob'
          ? raw
          : 'Player';
  return you ? `${base} (You)` : base;
}

function BoardRankRow({
  rank,
  name,
  you,
  username,
  userId,
  avatarUrl,
  score,
  status,
  muted,
  payout,
  currency,
  showAdjust,
  participantStatus,
}: {
  rank: string;
  name: string;
  you?: boolean;
  username: string | null;
  userId: string;
  avatarUrl: string | null;
  score: string;
  status: string;
  muted?: boolean;
  payout?: number | null;
  currency?: string | null;
  showAdjust?: boolean;
  participantStatus?: string | null;
}) {
  const ink = muted ? THEME.textMuted : THEME.textPrimary;
  const label = boardRowPlayerName(name, username, you);
  const avatarName = label.replace(/ \(You\)$/, '');
  const scoreText = String(score ?? '').trim() || '0';
  return (
    <View className="flex-row items-center" style={{ minHeight: 52 }}>
      <AppText
        className="text-center text-[13px] font-extrabold"
        style={{ color: ink, width: 24, flexShrink: 0, fontVariant: ['tabular-nums'] }}>
        {rank}
      </AppText>
      <ProfileLink
        username={username}
        userId={userId}
        fill
        style={{ flex: 1, minWidth: 0, minHeight: 52 }}>
        <View className="flex-row items-center" style={{ flex: 1, minWidth: 0, minHeight: 52, gap: 10 }}>
          <View style={{ width: 36, flexShrink: 0 }}>
            <Avatar uri={avatarUrl} name={avatarName} size={36} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText className="text-[15px] font-semibold" style={{ color: ink }} numberOfLines={1}>
              {label}
            </AppText>
            <AppText
              className="text-[12px] font-semibold"
              numberOfLines={1}
              style={{ color: muted ? THEME.textMuted : THEME.accent }}>
              {status}
            </AppText>
          </View>
        </View>
      </ProfileLink>
      <View className="items-end" style={{ flexShrink: 0, marginLeft: 8 }}>
        <AppText
          className="text-[15px] font-extrabold"
          style={{ color: ink, fontVariant: ['tabular-nums'] }}>
          {scoreText}
        </AppText>
        {payout != null && Number(payout) > 0 ? (
          <StakeAmount
            amount={payout}
            currency={currency}
            size={12}
            zeroAsNumber
            textClassName="text-[12px] font-bold text-charcoal"
          />
        ) : null}
      </View>
      {showAdjust ? (
        <View style={{ flexShrink: 0 }}>
          <BoardAdjustButton userId={userId} displayName={avatarName} status={participantStatus} />
        </View>
      ) : null}
    </View>
  );
}
