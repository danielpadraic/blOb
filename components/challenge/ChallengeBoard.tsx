import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ChallengeLifecycleStatus } from '@/components/challenge/ChallengeLifecycleStatus';
import { FieldNoteLabel } from '@/components/challenge/FieldNote';
import { SettlementSummary } from '@/components/challenge/SettlementSummary';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { MascotState } from '@/components/mascot/MascotState';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import {
  boardEmptyCopy,
  boardRowTag,
  boardScoreLabel,
  boardSettledCopy,
  buildBoard,
  rankBoardRows,
} from '@/lib/board';
import { usesPointsBoard } from '@/lib/challengeExperience';
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
}: ChallengeBoardProps) {
  const [receiptOpen, setReceiptOpen] = useState(showReceipt);
  const view = useMemo(
    () =>
      buildBoard({
        status: challenge.status,
        prizePool: Number(challenge.prize_pool) || Number(settlement?.settlement.prize_pool) || 0,
        participants: (roster ?? []).map((row) => ({
          user_id: row.user_id,
          days_completed: row.days_completed,
          points: row.points,
          status: row.status,
          eliminated_at: row.eliminated_at,
          joined_at: row.joined_at,
          display_name: row.profile?.display_name,
          username: row.profile?.username,
          avatar_url: row.profile?.avatar_url,
        })),
        completedUserIds,
        settlement: settlement
          ? {
              winner_count: settlement.settlement.winner_count,
              prize_pool: settlement.settlement.prize_pool,
              payouts: settlement.payouts,
            }
          : null,
        viewerId,
        joined,
      }),
    [challenge.prize_pool, challenge.status, completedUserIds, joined, roster, settlement, viewerId],
  );
  const settledCopy = boardSettledCopy(view);
  const openReceipt = receiptOpen || showReceipt;
  const pointsBoard = usesPointsBoard(challenge);
  const requiredDays = challengeTargetCount(challenge);
  const rows = useMemo(
    () => rankBoardRows(view.people, pointsBoard ? 'points' : 'days'),
    [pointsBoard, view.people],
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
            {copy('board.remaining')} {view.remainingCount}
            {' · '}
            {copy('board.caughtUp')} {view.caughtUpCount}
            {' · '}
            {copy('board.dropped')} {view.droppedCount}
          </AppText>
        </View>
      </Pressable>
    );
  }

  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <FieldNoteLabel
          note={pointsBoard ? 'boardPoints' : 'board'}
          textClassName="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Board
        </FieldNoteLabel>
        <ChallengeLifecycleStatus compact status={challenge.status} />
      </View>

      <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
        {copy('board.remaining')} {view.remainingCount}
        {' · '}
        {copy('board.caughtUp')} {view.caughtUpCount}
        {' · '}
        {copy('board.dropped')} {view.droppedCount}
      </AppText>

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
              name={row.you ? `${row.name} (You)` : row.name}
              username={row.username}
              userId={row.userId}
              avatarUrl={row.avatarUrl}
              score={boardScoreLabel(row, { pointsBoard, requiredDays })}
              status={boardRowTag(row, view.settled)}
              muted={row.bucket === 'dropped'}
              payout={view.settled ? row.payout : null}
              currency={challenge.currency}
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

function BoardRankRow({
  rank,
  name,
  username,
  userId,
  avatarUrl,
  score,
  status,
  muted,
  payout,
  currency,
}: {
  rank: string;
  name: string;
  username: string | null;
  userId: string;
  avatarUrl: string | null;
  score: string;
  status: string;
  muted?: boolean;
  payout?: number | null;
  currency?: string | null;
}) {
  const ink = muted ? THEME.textMuted : THEME.textPrimary;
  return (
    <ProfileLink username={username} userId={userId} style={{ minHeight: 52 }}>
      <View className="flex-row items-center" style={{ gap: 10, minHeight: 52 }}>
        <AppText
          className="w-6 text-center text-[13px] font-extrabold"
          style={{ color: ink }}>
          {rank}
        </AppText>
        <Avatar uri={avatarUrl} name={name} size={36} />
        <View className="min-w-0 flex-1">
          <AppText className="text-[15px] font-semibold" style={{ color: ink }} numberOfLines={1}>
            {name}
          </AppText>
          <AppText className="text-[12px] font-semibold" style={{ color: muted ? THEME.textMuted : THEME.accent }}>
            {status}
          </AppText>
        </View>
        <View className="items-end">
          <AppText className="text-[15px] font-extrabold" style={{ color: ink }}>
            {score}
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
      </View>
    </ProfileLink>
  );
}
